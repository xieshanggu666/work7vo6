<script setup>
import { computed, ref, watch } from 'vue'
import { useHrStore } from '@/store/hr'

const store = useHrStore()
const open = ref(false)
const editing = ref(null)
const form = ref({ name: '', dept: '技术部', city: '上海', level: 'P5', salary_min: 15000, salary_max: 30000, years: 2, slots: 1 })
const skillInput = ref('')
const skills = ref([])

const depts = ['技术部', '产品部', '设计部', '数据部', '质量部', '市场部']
const cities = ['北京', '上海', '深圳', '杭州', '广州', '成都', '武汉', '南京']

const appCount = pid => store.applications.filter(a => a.position_id === pid).length

function openNew() {
  editing.value = null
  form.value = { name: '', dept: '技术部', city: '上海', level: 'P5', salary_min: 15000, salary_max: 30000, years: 2, slots: 1 }
  skills.value = []
  skillInput.value = ''
  open.value = true
}
function openEdit(p) {
  editing.value = p
  form.value = { name: p.name, dept: p.dept, city: p.city, level: p.level, salary_min: p.salary_min, salary_max: p.salary_max, years: p.years, slots: p.slots }
  skills.value = p.skills.map(s => ({ ...s }))
  skillInput.value = ''
  open.value = true
}
function addSkill() {
  const k = skillInput.value.trim()
  if (k) skills.value.push({ k, w: 5 })
  skillInput.value = ''
}
function submit() {
  const payload = { ...form.value, skills: skills.value }
  if (editing.value) store.updatePosition(editing.value.id, { status: 'open' })
  else store.addPosition(payload)
  open.value = false
}
</script>

<template>
  <div class="positions">
    <div class="bar">
      <span class="muted">共 {{ store.positions.length }} 个职位 · 在招 {{ store.openPositions.length }}</span>
      <button class="primary" @click="openNew">＋ 发布职位</button>
    </div>

    <div class="cards">
      <div class="pcard card" v-for="p in store.positions" :key="p.id" :class="{ closed: p.status === 'closed' }">
        <div class="phead">
          <div>
            <b>{{ p.name }}</b>
            <span class="tag" :class="p.status">{{
            p.status === 'open' ? '🔥 招聘中' : '⏸ 已关闭' }}</span>
          </div>
          <div class="meta muted">
            <span>🏢 {{ p.dept }}</span><span>📍 {{ p.city }}</span><span>{{ p.level }}</span>
          </div>
        </div>
        <div class="sal money">¥{{ p.salary_min.toLocaleString() }} - {{ p.salary_max.toLocaleString() }}</div>
        <div class="chips">
          <span class="skill-chip" v-for="s in p.skills" :key="s.k">{{ s.k }} <i>x{{ s.w }}</i></span>
        </div>
        <div class="pmeta muted">
          <span>经验 {{ p.years }} 年+</span><span>编制 {{ p.slots }}</span><span>应聘 {{ appCount(p.id) }}</span>
        </div>
        <div class="acts">
          <button class="ghost" @click="openEdit(p)">编辑</button>
          <button class="warn" v-if="p.status === 'open'" @click="store.updatePosition(p.id, { status: 'closed' })">关闭职位</button>
          <button class="succ" v-else @click="store.updatePosition(p.id, { status: 'open' })">重新开放</button>
        </div>
      </div>
    </div>

    <div class="modal" v-if="open">
      <div class="modal-box card">
        <h3>{{ editing ? '✏️ 编辑职位' : '📌 发布新职位' }}</h3>
        <div class="form">
          <div class="fg">
            <label>职位名称<input v-model="form.name" placeholder="如 前端开发工程师" /></label>
            <label>部门<select v-model="form.dept"><option v-for="d in depts" :key="d">{{ d }}</option></select></label>
          </div>
          <div class="fg">
            <label>城市<select v-model="form.city"><option v-for="c in cities" :key="c">{{ c }}</option></select></label>
            <label>职级<select v-model="form.level"><option v-for="l in ['P4','P5','P6','P7','P8']" :key="l">{{ l }}</option></select></label>
          </div>
          <div class="fg">
            <label>最低薪资<input type="number" v-model.number="form.salary_min" /></label>
            <label>最高薪资<input type="number" v-model.number="form.salary_max" /></label>
          </div>
          <div class="fg">
            <label>经验年限<input type="number" v-model.number="form.years" /></label>
            <label>编制人数<input type="number" v-model.number="form.slots" /></label>
          </div>
          <label>技能要求（权重5=必备）</label>
          <div class="skill-editor">
            <input v-model="skillInput" placeholder="输入技能回车添加" @keyup.enter="addSkill" />
            <button class="ghost" @click="addSkill">＋ 添加</button>
          </div>
          <div class="edit-chips">
            <span v-for="(s, i) in skills" :key="i" class="chipx">
              {{ s.k }}<select v-model.number="s.w"><option :value="1">1</option><option :value="2">2</option><option :value="3">3</option><option :value="4">4</option><option :value="5">5</option></select>
              <button class="x" @click="skills.splice(i, 1)">✕</button>
            </span>
          </div>
        </div>
        <div class="acts">
          <button class="primary" @click="submit">{{ editing ? '保存' : '发布' }}</button>
          <button class="ghost" @click="open = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.positions { display: flex; flex-direction: column; gap: 14px; }
.bar { display: flex; justify-content: space-between; align-items: center; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
.pcard { display: flex; flex-direction: column; gap: 10px; }
.pcard.closed { opacity: .6; }
.phead { display: flex; justify-content: space-between; align-items: flex-start; }
.phead b { font-size: 16px; }
.meta { display: flex; gap: 8px; font-size: 12px; }
.sal { font-size: 15px; }
.chips { display: flex; flex-wrap: wrap; }
.chips i { font-style: normal; opacity: .7; font-size: 10px; }
.pmeta { display: flex; gap: 12px; font-size: 12px; }
.tag.open { background: rgba(87,214,160,.15); color: var(--green); border-color: rgba(87,214,160,.4); }
.tag.closed { background: rgba(140,149,176,.1); }
.acts { display: flex; gap: 6px; }
.form { display: flex; flex-direction: column; gap: 10px; margin: 14px 0; }
.fg { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.form label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; color: var(--muted); }
.skill-editor { display: flex; gap: 8px; }
.skill-editor input { flex: 1; }
.edit-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chipx { display: inline-flex; align-items: center; gap: 4px; background: rgba(91,140,255,.14); border: 1px solid rgba(91,140,255,.35); padding: 2px 6px; border-radius: 10px; font-size: 12px; }
.chipx select { background: transparent; border: none; color: var(--accent2); width: 34px; }
.chipx .x { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 11px; padding: 0 2px; }
</style>