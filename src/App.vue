<script setup lang="ts">
import { ref } from 'vue'
import AdministrativeMap from './components/AdministrativeMap.vue'
import MapView from './components/MapView.vue'
import ModelViewer from './components/ModelViewer.vue'

type ViewKey = 'home' | 'admin' | 'map' | 'model'

const current = ref<ViewKey>('home')

const views: { key: Exclude<ViewKey, 'home'>; title: string; desc: string }[] = [
  {
    key: 'admin',
    title: '行政区地图',
    desc: '从全国逐级下钻到区县、乡镇和村界'
  },
  {
    key: 'map',
    title: '瓦片地图',
    desc: '影像底图、地名搜索，以及村界数据定位'
  },
  {
    key: 'model',
    title: '三维模型',
    desc: '查看模型、调整视角并播放动画'
  }
]
</script>

<template>
  <div class="app-shell">
    <section v-if="current === 'home'" class="hub">
      <div class="hub-inner">
        <h1>演示聚合</h1>
        <p class="hub-desc">选择一个组件进入，进入后可以随时切换。</p>
        <div class="hub-grid">
          <button
            v-for="view in views"
            :key="view.key"
            type="button"
            class="hub-card"
            @click="current = view.key"
          >
            <strong>{{ view.title }}</strong>
            <span>{{ view.desc }}</span>
          </button>
        </div>
      </div>
    </section>

    <template v-else>
      <AdministrativeMap v-if="current === 'admin'" />
      <MapView v-else-if="current === 'map'" />
      <ModelViewer v-else />

      <nav class="switcher" aria-label="组件切换">
        <button type="button" class="switcher-btn" @click="current = 'home'">聚合页</button>
        <button
          v-for="view in views"
          :key="view.key"
          type="button"
          class="switcher-btn"
          :class="{ active: current === view.key }"
          @click="current = view.key"
        >
          {{ view.title }}
        </button>
      </nav>
    </template>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  width: 100%;
  height: 100%;
  max-width: none;
  margin: 0;
  padding: 0;
  text-align: left;
}

#app {
  height: 100vh;
}

.app-shell {
  width: 100%;
  height: 100%;
}

.hub {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
  color: #0f172a;
}

.hub-inner {
  width: min(920px, calc(100% - 48px));
}

.hub h1 {
  font-size: 32px;
  line-height: 1.2;
  font-weight: 700;
}

.hub-desc {
  margin-top: 8px;
  color: #64748b;
  font-size: 15px;
}

.hub-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 28px;
}

.hub-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-height: 148px;
  padding: 20px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  color: #0f172a;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

.hub-card strong {
  font-size: 18px;
}

.hub-card span {
  color: #64748b;
  font-size: 14px;
  line-height: 1.5;
}

.hub-card:hover {
  border-color: #93c5fd;
  background: #fff;
}

.switcher {
  position: fixed;
  z-index: 4000;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  padding: 6px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.88);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.28);
}

.switcher-btn {
  height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #e2e8f0;
  font-size: 13px;
  cursor: pointer;
}

.switcher-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: transparent;
}

.switcher-btn.active {
  background: #2563eb;
  color: #fff;
}

@media (max-width: 800px) {
  .hub-grid {
    grid-template-columns: 1fr;
  }

  .switcher {
    width: calc(100% - 24px);
    overflow-x: auto;
  }
}
</style>
