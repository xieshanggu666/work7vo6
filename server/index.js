import express from 'express'
import db, { ts } from './db.js'

const app = express()
app.use(express.json())
const PORT = 4160

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d }
const parseSkills = s => { try { return JSON.parse(s || '[]') } catch { return [] } }
const parseDims = (s, d) => { try { return JSON.parse(s || d || '[]') } catch { return [] } }

const STAGES = ['submitted', 'screening', 'interview', 'offer', 'hired']
const NEXT_STAGE = { submitted: 'screening', screening: 'interview', interview: 'offer', offer: 'hired' }

// ---------------- 人岗匹配评分算法 ----------------
// 五维权重，合计闭合为 1.0；简历关键词为封顶附加分，不占用维度权重
const MATCH_W = { skill: 0.4, year: 0.2, salary: 0.15, edu: 0.15, city: 0.1 }
const KEYWORD_BONUS_CAP = 5

function computeMatch(cand, pos) {
  const cSkills = parseSkills(cand.skills)
  const pSkills = parseSkills(pos.skills)
  const dims = []

  // 技能匹配：候选者命中职位要求技能的熟练度按职位权重加权
  let skillScore = 0, matched = 0, skillWeightSum = 0
  pSkills.forEach(req => {
    const hit = cSkills.find(c => c.k === req.k)
    if (hit) { skillScore += Math.min(100, (num(hit.idx, 3) / 5) * 100) * req.w; matched++ }
    skillWeightSum += req.w
  })
  const skillCover = pSkills.length ? matched / pSkills.length : 1
  skillScore = pSkills.length ? (skillWeightSum ? skillScore / skillWeightSum : 0) : 70
  dims.push({ k: '技能', score: Math.round(skillScore), w: MATCH_W.skill })

  // 年限匹配
  const ideal = num(pos.years, 0)
  const yearScore = num(cand.years, 0) >= ideal ? 90 : Math.max(30, 100 - (ideal - num(cand.years, 0)) * 15)
  dims.push({ k: '经验年限', score: Math.round(yearScore), w: MATCH_W.year })

  // 薪资带宽匹配（先判低于带宽，再判高于带宽，避免分支被吞）
  const sal = num(cand.exp_salary, 0)
  let salScore, salNote, salOver = false, salOverMuch = false
  if (sal <= 0) { salScore = 70; salNote = '期望薪资未填写' }
  else if (sal < pos.salary_min) { salScore = 75; salNote = '期望薪资低于带宽' }
  else if (sal <= pos.salary_max) { salScore = 90; salNote = '期望薪资在带宽内' }
  else if (sal <= pos.salary_max * 1.15) { salScore = 70; salNote = '期望薪资略高于带宽'; salOver = true }
  else { salScore = 45; salNote = '期望薪资超出带宽'; salOver = true; salOverMuch = true }
  dims.push({ k: '薪资匹配', score: salScore, w: MATCH_W.salary })

  // 学历匹配
  const eduRank = { '博士': 100, '硕士': 85, '本科': 70, '大专': 55 }
  const eduScore = eduRank[cand.edu] ?? 65
  dims.push({ k: '学历', score: eduScore, w: MATCH_W.edu })

  // 城市匹配
  const cityHit = pos.city === '全国' || (!!cand.city && cand.city === pos.city)
  const cityScore = cityHit ? 90 : 65
  dims.push({ k: '城市地点', score: cityScore, w: MATCH_W.city })

  // 简历关键词加分（在职位名/要求技能中命中，封顶，不计入维度权重）
  const keywords = new Set([...pSkills.map(s => s.k), ...String(pos.name || '').split(/[\s/、,，]+/).filter(Boolean)])
  const tokens = String(cand.raw || '').split(/[,，。；;、/\s]+/).filter(Boolean)
  const hitKws = new Set([...keywords].filter(kw => tokens.some(t => t.includes(kw))))
  const keywordBonus = Math.min(KEYWORD_BONUS_CAP, hitKws.size * 1.5)

  // 五维加权（权重合计 1.0）+ 封顶关键词附加分
  const base = skillScore * MATCH_W.skill
    + yearScore * MATCH_W.year
    + salScore * MATCH_W.salary
    + eduScore * MATCH_W.edu
    + cityScore * MATCH_W.city
  const score = Math.min(100, Math.round(base + keywordBonus))

  // 短板：覆盖技能/年限/薪资/学历/城市五个维度
  const weakness = []
  if (skillCover < 0.5) weakness.push('关键技能覆盖不足')
  if (yearScore < 65) weakness.push('经验年限偏低')
  if (salOverMuch) weakness.push('期望薪资超出带宽')
  else if (salOver) weakness.push('期望薪资略高于带宽')
  if (eduScore < 60) weakness.push('学历相对偏低')
  if (!cityHit) weakness.push('工作城市不匹配')

  const rating = score >= 80 ? '高匹配' : score >= 65 ? '匹配度良好' : score >= 55 ? '基本匹配' : '匹配度偏低'
  const cityNote = cityHit
    ? (pos.city === '全国' ? '城市全国可选' : `城市${cand.city}与职位一致`)
    : `城市${cand.city || '未知'}≠${pos.city}`
  const reason = [
    `技能覆盖${Math.round(skillCover * 100)}%`,
    `经验${cand.years}/${ideal}年`,
    salNote,
    `${cand.edu || '学历未知'}`,
    cityNote
  ].join('，') + `；综合${rating}${keywordBonus ? `（简历关键词+${keywordBonus.toFixed(1)}分）` : ''}`

  return { score, dims, reason, weakness: weakness.join('、') || '无显著短板' }
}

function upsertMatch(candId, posId) {
  const cand = db.prepare('SELECT * FROM candidates WHERE id=?').get(candId)
  const pos = db.prepare('SELECT * FROM positions WHERE id=?').get(posId)
  if (!cand || !pos) return null
  const m = computeMatch(cand, pos)
  db.prepare('DELETE FROM matches WHERE candidate_id=? AND position_id=?').run(candId, posId)
  const r = db.prepare('INSERT INTO matches(candidate_id,position_id,score,dims,reason,weakness) VALUES(?,?,?,?,?,?)')
    .run(candId, posId, m.score, JSON.stringify(m.dims), m.reason, m.weakness)
  return { id: Number(r.lastInsertRowid), ...m, candidate_id: candId, position_id: posId }
}

// ---------------- 状态汇总 ----------------
app.get('/api/state', (req, res) => {
  const positions = db.prepare('SELECT * FROM positions ORDER BY id').all().map(p => ({ ...p, skills: parseSkills(p.skills) }))
  const candidates = db.prepare('SELECT * FROM candidates ORDER BY id').all().map(c => ({ ...c, skills: parseSkills(c.skills) }))
  const apps = db.prepare('SELECT * FROM applications ORDER BY id DESC').all()
  const interviews = db.prepare('SELECT * FROM interviews ORDER BY id DESC').all()
  const offers = db.prepare('SELECT * FROM offers ORDER BY id DESC').all()
  const channels = db.prepare('SELECT * FROM channels ORDER BY id').all()
  const matches = db.prepare('SELECT * FROM matches ORDER BY id DESC').all().map(m => ({
    ...m,
    score: num(m.score),
    dims: parseDims(m.dims, '[]')
  }))
  const matchOf = (cid, pid) => matches.find(m => m.candidate_id === cid && m.position_id === pid) || null
  const pipelines = apps.map(a => {
    const pos = positions.find(p => p.id === a.position_id)
    const cand = candidates.find(c => c.id === a.candidate_id)
    const its = interviews.filter(i => i.application_id === a.id)
    const of = offers.find(o => o.application_id === a.id) || null
    const mt = matchOf(a.candidate_id, a.position_id)
    return {
      ...a,
      position: pos ? pos.name : '', dept: pos ? pos.dept : '', city: pos ? pos.city : '',
      candidate: cand ? cand.name : '', candSkills: cand ? cand.skills : [],
      match: mt ? { score: mt.score, dims: mt.dims, reason: mt.reason, weakness: mt.weakness } : null,
      interviews: its, offer: of
    }
  })
  res.json({ positions, candidates, applications: pipelines, interviews, offers, channels, matches })
})

app.get('/api/summary', (req, res) => {
  const pos = db.prepare('SELECT status, COUNT(*) c FROM positions GROUP BY status').all()
  const apps = db.prepare('SELECT stage, COUNT(*) c FROM applications GROUP BY stage').all()
  const cand = db.prepare('SELECT COUNT(*) c FROM candidates').get().c
  return res.json({ positions: pos, applications: apps, candidates: cand })
})

// ---------------- 职位 ----------------
app.post('/api/positions', (req, res) => {
  const b = req.body || {}
  const r = db.prepare('INSERT INTO positions(name,dept,city,level,salary_min,salary_max,skills,years,slots,status,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(b.name, b.dept || '技术部', b.city || '上海', b.level || 'P5', num(b.salary_min, 15000), num(b.salary_max, 30000), JSON.stringify(b.skills || []), num(b.years, 2), num(b.slots, 1), 'open', ts())
  res.json({ ok: true, id: Number(r.lastInsertRowid) })
})

app.post('/api/positions/:id', (req, res) => {
  const id = num(req.params.id)
  const b = req.body || {}
  if (b.status) db.prepare('UPDATE positions SET status=? WHERE id=?').run(b.status, id)
  if (b.skills !== undefined) db.prepare('UPDATE positions SET skills=? WHERE id=?').run(JSON.stringify(b.skills), id)
  res.json({ ok: true })
})

// ---------------- 候选人 ----------------
app.post('/api/candidates', (req, res) => {
  const b = req.body || {}
  const r = db.prepare('INSERT INTO candidates(name,phone,skills,years,edu,school,city,exp_salary,channel,raw) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(b.name, b.phone || '', JSON.stringify(b.skills || []), num(b.years, 0), b.edu || '本科', b.school || '', b.city || '', num(b.exp_salary, 0), b.channel || '内推', b.raw || `候选人${b.name}的简历`)
  res.json({ ok: true, id: Number(r.lastInsertRowid) })
})

app.delete('/api/candidates/:id', (req, res) => {
  db.prepare('DELETE FROM candidates WHERE id=?').run(num(req.params.id))
  res.json({ ok: true })
})

// ---------------- 匹配 ----------------
app.get('/api/match/pos/:pid', (req, res) => {
  const posId = num(req.params.pid)
  const pos = db.prepare('SELECT * FROM positions WHERE id=?').get(posId)
  if (!pos) return res.status(404).json({ ok: false })
  const cands = db.prepare('SELECT * FROM candidates').all()
  const rows = cands.map(c => {
    // 每次匹配都重算并落库，保证推荐结果与已落库结果一致
    const m = upsertMatch(c.id, posId)
    return { candidate_id: c.id, name: c.name, skills: parseSkills(c.skills), years: c.years, edu: c.edu, city: c.city, exp_salary: c.exp_salary, score: m.score, dims: m.dims, reason: m.reason, weakness: m.weakness }
  })
  rows.sort((a, b) => b.score - a.score)
  res.json({ position: { ...pos, skills: parseSkills(pos.skills) }, candidates: rows })
})

app.get('/api/match/cand/:cid', (req, res) => {
  const candId = num(req.params.cid)
  const cand = db.prepare('SELECT * FROM candidates WHERE id=?').get(candId)
  if (!cand) return res.status(404).json({ ok: false })
  const poss = db.prepare("SELECT * FROM positions WHERE status='open'").all()
  const rows = poss.map(p => {
    // 与按职位推荐共用同一落库逻辑，保证分数/理由/短板完全一致
    const m = upsertMatch(candId, p.id)
    return { position_id: p.id, name: p.name, dept: p.dept, city: p.city, level: p.level, salary_min: p.salary_min, salary_max: p.salary_max, score: m.score, dims: m.dims, reason: m.reason, weakness: m.weakness }
  })
  rows.sort((a, b) => b.score - a.score)
  res.json({ candidate: { name: cand.name, skills: parseSkills(cand.skills), years: cand.years }, positions: rows })
})

// ---------------- 应聘流程 ----------------
app.post('/api/applications', (req, res) => {
  const b = req.body || {}
  const pid = num(b.position_id), cid = num(b.candidate_id)
  const dup = db.prepare('SELECT * FROM applications WHERE position_id=? AND candidate_id=?').get(pid, cid)
  if (dup) return res.json({ ok: false, msg: '该候选人已投递此职位' })
  upsertMatch(cid, pid)
  const r = db.prepare('INSERT INTO applications(position_id,candidate_id,stage,updated,recruiter) VALUES(?,?,?,?,?)')
    .run(pid, cid, 'submitted', ts(), b.recruiter || 'HR-Sandy')
  res.json({ ok: true, id: Number(r.lastInsertRowid) })
})

app.post('/api/applications/:id/advance', (req, res) => {
  const id = num(req.params.id)
  const a = db.prepare('SELECT * FROM applications WHERE id=?').get(id)
  if (!a) return res.status(404).json({ ok: false })
  const next = NEXT_STAGE[a.stage]
  if (!next) return res.json({ ok: false, msg: '已到最后阶段' })
  db.prepare('UPDATE applications SET stage=?, updated=? WHERE id=?').run(next, ts(), id)
  res.json({ ok: true })
})

app.post('/api/applications/:id/reject', (req, res) => {
  const id = num(req.params.id)
  db.prepare("UPDATE applications SET stage='rejected', updated=? WHERE id=?").run(ts(), id)
  res.json({ ok: true })
})

// ---------------- 面试 ----------------
app.post('/api/applications/:id/interview', (req, res) => {
  const b = req.body || {}
  const r = db.prepare('INSERT INTO interviews(application_id,interviewer,time,round,eval,result) VALUES(?,?,?,?,?,?)')
    .run(num(req.params.id), b.interviewer || '面试官', b.time || ts(), b.round || '初试', b.eval || '', b.result || 'pending')
  res.json({ ok: true, id: Number(r.lastInsertRowid) })
})

app.post('/api/interviews/:id', (req, res) => {
  const b = req.body || {}
  const sets = [], vals = []
  if (b.result) { sets.push('result=?'); vals.push(b.result) }
  if (b.eval !== undefined) { sets.push('eval=?'); vals.push(b.eval) }
  if (!sets.length) return res.json({ ok: false })
  vals.push(num(req.params.id))
  db.prepare(`UPDATE interviews SET ${sets.join(',')} WHERE id=?`).run(...vals)
  res.json({ ok: true })
})

// ---------------- Offer ----------------
app.post('/api/applications/:id/offer', (req, res) => {
  const b = req.body || {}
  const r = db.prepare('INSERT INTO offers(application_id,salary,status,due,note) VALUES(?,?,?,?,?)')
    .run(num(req.params.id), num(b.salary, 20000), 'pending', ts(), b.note || '')
  res.json({ ok: true, id: Number(r.lastInsertRowid) })
})

app.post('/api/offers/:id', (req, res) => {
  const b = req.body || {}
  const of = db.prepare('SELECT * FROM offers WHERE id=?').get(num(req.params.id))
  if (!of) return res.status(404).json({ ok: false })
  if (b.status) {
    db.prepare('UPDATE offers SET status=? WHERE id=?').run(b.status, num(req.params.id))
    // offer accepted → 流程推进到hired(可入职)
    if (b.status === 'accepted') db.prepare("UPDATE applications SET stage='hired', updated=? WHERE id=?").run(ts(), of.application_id)
    if (b.status === 'rejected') db.prepare("UPDATE applications SET stage='rejected', updated=? WHERE id=?").run(ts(), of.application_id)
  }
  res.json({ ok: true })
})

// ---------------- 渠道 ----------------
app.post('/api/channels', (req, res) => {
  const b = req.body || {}
  db.prepare('INSERT INTO channels(name,cost) VALUES(?,?)').run(b.name, num(b.cost, 5000))
  res.json({ ok: true })
})

// 启动时按当前算法重算全部已落库匹配，修复历史评分（城市维度缺失、权重不闭合等）
function refreshAllMatches() {
  const rows = db.prepare('SELECT candidate_id, position_id FROM matches').all()
  rows.forEach(r => upsertMatch(r.candidate_id, r.position_id))
  if (rows.length) console.log(`[HR] refreshed ${rows.length} stored matches`)
}
refreshAllMatches()

app.listen(PORT, () => console.log(`[HR] API running at http://localhost:${PORT}`))