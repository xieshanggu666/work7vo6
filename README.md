# 📋 招聘流程管理与人才智能匹配平台（TalentFlow）

面向 HR 的一站式招聘流程管理系统：管理职位发布、候选人投递、简历解析、**人岗智能匹配评分**、面试安排、Offer 发放与入职驱动。平台以职位与候选人建档为基础，通过技能权重/年限/薪资/学历等多维加权计算匹配度，自动推荐高匹配候选人，并驱动简历筛选、面试评价与招聘漏斗分析。

## 技术栈

- **前端**：Vue 3 + Vite + Pinia（状态管理）+ 内联 SVG 图表
- **后端**：Express + Node.js 内置 `node:sqlite`
- **数据库**：SQLite（`server/hr.db`）
- **通信**：REST API，Vite 代理 `/api` 到后端
- **启动**：`concurrently` 同时拉起前后端

## 目录结构

```
hr/
├── index.html
├── package.json
├── vite.config.js               # Vite 配置 + /api 代理
├── .gitignore
├── README.md
├── server/
│   ├── db.js                    # SQLite 建表 + 种子数据
│   ├── index.js                 # REST API + 人岗匹配算法
│   └── hr.db                    # SQLite 数据库文件
└── src/
    ├── main.js
    ├── App.vue                  # 主布局 + 侧边导航
    ├── style.css
    ├── store/hr.js              # Pinia store（对接 API）
    └── components/
        ├── OverviewView.vue     # 招聘总览看板
        ├── PositionsView.vue    # 职位管理
        ├── CandidatesView.vue   # 候选人库
        ├── MatchView.vue        # 智能匹配
        ├── PipelineView.vue     # 招聘流程看板
        ├── InterviewView.vue    # 面试管理
        ├── OfferView.vue        # Offer 管理
        └── ReportsView.vue      # 报表中心
```

## 快速开始

```bash
npm install     # 安装依赖
npm run dev     # 同时启动后端(4160) 与 前端 Vite
```

浏览器访问 Vite 输出的地址（默认 `http://localhost:5202`，若被占用会自动切换端口）。

## 数据模型（SQLite 表）

| 表 | 说明 |
|----|------|
| `positions` | 职位（技能权重 `skills` JSON、薪资带宽、编制） |
| `candidates` | 候选人（结构化技能、年限、学历、期望薪资、来源渠道） |
| `matches` | 人岗匹配评分（总分 + 各维度得分 + 理由 + 短板） |
| `applications` | 应聘记录（Stage 状态机：投递/筛选/面试/Offer/录用/淘汰） |
| `interviews` | 面试轮次与评价 |
| `offers` | Offer 与接受/入职流转 |
| `channels` | 招聘渠道及成本 |

## 人岗匹配评分算法

按职位匹配候人或按候选人推荐职位时，综合五维加权：

- **技能**（权重 40%）：候选者命中职位要求的技能及其熟练度
- **经验年限**（20%）：与职位所需年限对比
- **薪资匹配**（15%）：期望薪资落入职位带宽程度
- **学历**（15%）：博士/硕士/本科/大专
- **城市地点**（10%）+ 简历关键词加分

输出 0-100 总分与各维度得分条，并给出推荐理由与短板提示（如"关键技能覆盖不足"、"期望薪资超带宽"）。

## 核心流程

智能匹配 → 纳入招聘流程 → 看板推进（投递→筛选→面试→Offer→录用）→ 面试评价 → 发起 Offer → 接受/入职，数据实时落库。

## 脚本

| 命令 | 作用 |
|------|------|
| `npm run dev` | 开发模式，并行启动后端与前端 |
| `npm run build` | 构建前端产物（`dist/`） |
| `npm run preview` | 预览构建产物 |