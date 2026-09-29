<script setup>
import { computed, ref } from 'vue'
import { useHrStore } from '@/store/hr'

const store = useHrStore()

const stages = [
  { k: 'submitted', label: '投递', icon: '📥', color: '#5b8cff' },
  { k: 'screening', label: '筛选', icon: '🔍', color: '#a78bfa' },
  { k: 'interview', label: '面试', icon: '💬', color: '#4fc3f7' },
  { k: 'offer', label: 'Offer', icon: '📄', color: '#ffd166' },
  { k: 'hired', label: '录用', icon: '🎉', color: '#57d6a0' }
]

const filter = ref('all')
const stageFilter = ref('all')

const list = computed(() => store.applications.filter(a => a.stage !== 'rejected'))
const viewList = computed(() => list.value.filter(a =>
  (stageFilter.value === 'all' || a.stage === stageFilter.value) &&
  (filter.value === 'all' || a.position === filter.value)
))

const nextStage = s => ({ submitted: 'screening', screening: 'interview', interview: 'offer', offer: 'hired' }[s])
const nextStageLabel = s => ({ screening: '筛选', interview: '面试', offer: 'Offer' }[s] || '')
</script>

<template>
  <div class="pipeline">
    <div class="bar">
      <div class="filters">
        <select v-model="filter">
          <option value="all">全部职位</option>
          <option v-for="p in store.openPositions" :key="p.id" :value="p.name">{{ p.name }}</option>
        </select>
        <select v-model="stageFilter">
          <option value="all">全部阶段</option>
          <option v-for="s in stages" :key="s.k" :value="s.k">{{ s.label }}</option>
        </select>
      </div>
    </div>

    <!-- Kanban -->
    <div class="kanban">
      <div class="kcol" v-for="s in stages" :key="s.k">
        <div class="khead" :style="{ borderColor: s.color }">
          <span>{{ s.icon }}</span><b>{{ s.label }}</b>
          <em class="tag">{{ viewList.filter(a => a.stage === s.k).length }}</em>
        </div>
        <div class="kbody">
          <div class="kcard card" v-for="a in viewList.filter(c => c.stage === s.k)" :key="a.id">
            <div class="kname">{{ a.candidate }}</div>
            <div class="kpos muted">{{ a.position }} · {{ a.dept }}</div>
            <div class="kskills"><span class="skill-chip" v-for="sk in (a.candSkills||[]).slice(0,4)" :key="sk.k">{{ sk.k }}</span></div>
            <div class="kfoot">
              <span class="muted">{{ a.city }}</span>
              <div class="ka">
                <button v-if="nextStage(a.stage)" class="primary" @click="store.advance(a.id)">→ {{ nextStageLabel(a.stage) }}</button>
                <span v-else class="succ-chip">✅ 已录用</span>
                <button class="danger" v-if="a.stage !== 'hired'" @click="store.reject(a.id)">淘汰</button>
              </div>
            </div>
          </div>
          <div class="muted empty-mini" v-if="!viewList.filter(c => c.stage === s.k).length">暂无</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pipeline { display: flex; flex-direction: column; gap: 14px; }
.bar { display: flex; }
.filters { display: flex; gap: 8px; }
.kanban { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
@media (max-width: 1100px) { .kanban { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); } }
.kcol { background: rgba(19,25,44,.6); border-radius: 12px; padding: 10px; border: 1px solid var(--border); }
.khead { display: flex; align-items: center; gap: 8px; padding-bottom: 8px; border-bottom: 2px solid; margin-bottom: 10px; }
.khead b { font-size: 14px; }
.khead .tag { margin-left: auto; }
.kbody { display: flex; flex-direction: column; gap: 10px; min-height: 60px; }
.kcard { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.kname { font-weight: 700; font-size: 14px; }
.kpos { font-size: 12px; }
.kskills { display: flex; flex-wrap: wrap; }
.kfoot { display: flex; flex-direction: column; gap: 8px; }
.ka { display: flex; gap: 6px; flex-wrap: wrap; }
.ka button { font-size: 11px; padding: 4px 8px; }
.succ-chip { color: var(--green); font-size: 12px; }
.empty-mini { font-size: 12px; padding: 10px; text-align: center; }
</style>