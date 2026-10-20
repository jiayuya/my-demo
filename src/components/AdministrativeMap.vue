<template>
  <div class="admin-map">
    <!-- ========================= -->
    <!-- 顶部面包屑 -->
    <!-- ========================= -->

    <div class="breadcrumb">
      <span class="breadcrumb-item" @click="goRoot">中国</span>

      <template v-for="(
            item,
            index
          ) in breadcrumbs" :key="item.code">
        <span class="separator">/</span>

        <span class="breadcrumb-item" @click="
              goBreadcrumb(index)
            ">{{ item.name }}</span>
      </template>
    </div>

    <!-- ========================= -->
    <!-- 左侧行政区 -->
    <!-- ========================= -->

    <aside class="side-panel" :class="{ collapsed: panelCollapsed }">
      <div class="panel-title">
        <div class="panel-heading">
          <div>
            <div>{{ currentTitle }}</div>
            <small>{{ currentLevelName }}</small>
          </div>
          <button type="button" class="panel-toggle" @click="togglePanel">
            {{ panelCollapsed ? '展开' : '收起' }}
          </button>
        </div>
      </div>

      <div v-if="loading" class="loading">加载中...</div>
      <div v-else-if="regions.length === 0" class="empty">没有下级行政区域</div>
      <div v-else class="region-list">
        <div
          v-for="region in regions"
          :key="region.code"
          class="region-item"
          :class="{
              active:
                region.code ===
                selectedCode
            }"
          @click="
              handleRegionClick(region)
            "
        >
          <span>{{ region.name }}</span>
          <span v-if="region.level < 5" class="arrow">›</span>
        </div>
      </div>
    </aside>

    <!-- ========================= -->
    <!-- 地图 -->
    <!-- ========================= -->

    <div ref="mapRef" class="map" />

    <!-- ========================= -->
    <!-- 右下角信息 -->
    <!-- ========================= -->

    <div class="info-panel">
      <div class="info-title">当前区域</div>
      <div class="info-name">{{ currentTitle }}</div>
      <div class="info-path">
        中国
        <template v-for="item in breadcrumbs" :key="item.code">
          /
          {{ item.name }}
        </template>
      </div>
      <div class="info-level">{{ currentLevelName }}</div>
    </div>

    <!-- ========================= -->
    <!-- Loading -->
    <!-- ========================= -->

    <div v-if="mapLoading" class="map-loading">
      <div class="loading-box">
        <div class="loading-spinner" />
        <span>正在加载地图...</span>
      </div>
    </div>
  </div>
</template>
  
  
  <script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

import 'leaflet/dist/leaflet.css'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
})

import { getProvinces, getCities, getCounties, getTowns, getVillages, getGeoJSON } from '../api/administrative'

import {
  LEVEL,
  LEVEL_NAME,
  getList,
  normalizeProvince,
  normalizeCity,
  normalizeCounty,
  normalizeTown,
  normalizeVillage
} from '../utils/administrative'

/* ========================= */
/* 地图 */
/* ========================= */

const mapRef = ref(null)
let map = null
let geoJsonLayer = null
let renderToken = 0
let renderController = null

/* ========================= */
/* 状态 */
/* ========================= */

const loading = ref(false)
const mapLoading = ref(false)
const panelCollapsed = ref(window.matchMedia('(max-width: 768px)').matches)
const regions = ref([])
const selectedCode = ref('')
const currentRegion = ref({
  code: '100000',
  name: '中国',
  level: LEVEL.COUNTRY
})

const breadcrumbs = ref([])

/**
 * 数据年份
 */
const YEAR = 2023

/* ========================= */
/* 计算属性 */
/* ========================= */

const currentTitle = computed(() => {
  return currentRegion.value.name
})

const currentLevelName = computed(() => {
  return LEVEL_NAME[currentRegion.value.level]
})

/* ========================= */
/* 初始化 */
/* ========================= */

onMounted(async () => {
  initMap()
  window.addEventListener('resize', handleResize)
  await loadRoot()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (map) {
    map.remove()

    map = null
  }
})

function handleResize() {
  if (window.innerWidth > 768) {
    panelCollapsed.value = false
  }
  map?.invalidateSize()
}

function togglePanel() {
  panelCollapsed.value = !panelCollapsed.value
  requestAnimationFrame(() => map?.invalidateSize())
}

function boundsPadding() {
  if (window.innerWidth > 768) {
    return { padding: [50, 50] }
  }

  return {
    paddingTopLeft: [16, 72],
    paddingBottomRight: [16, panelCollapsed.value ? 150 : 300]
  }
}

/* ========================= */
/* 创建地图 */
/* ========================= */

function initMap() {
  map = L.map(mapRef.value, {
    center: [22.5431, 114.0579],
    zoom: 12,
    minZoom: 5,
    maxZoom: 18,
    zoomControl: true
  })

  /**
   * OpenStreetMap
   */
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    minZoom: 5,
    maxZoom: 18,
    tileSize: 256
  }).addTo(map)
}

/* ========================= */
/* 加载省 */
/* ========================= */

async function loadRoot() {
  loading.value = true

  try {
    const response = await getProvinces(YEAR)
    const list = getList(response)

    regions.value = list.map(normalizeProvince)
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }

  await renderRegions(regions.value)
}

/* ========================= */
/* 获取下级 */
/* ========================= */

async function loadChildren(region) {
  loading.value = true
  try {
    let response
    let normalizer

    switch (region.level) {
      case LEVEL.PROVINCE:
        response = await getCities({
          year: YEAR,
          province: region.name
        })
        normalizer = normalizeCity
        break

      case LEVEL.CITY:
        response = await getCounties({
          year: YEAR,
          province: breadcrumbs.value[0]?.name,
          city: region.name
        })
        normalizer = normalizeCounty
        break

      case LEVEL.COUNTY:
        response = await getTowns({
          year: YEAR,
          province: breadcrumbs.value[0]?.name,
          city: breadcrumbs.value[1]?.name,
          county: region.name
        })
        normalizer = normalizeTown
        break

      case LEVEL.TOWN:
        response = await getVillages({
          year: YEAR,
          province: breadcrumbs.value[0]?.name,
          city: breadcrumbs.value[1]?.name,
          county: breadcrumbs.value[2]?.name,
          town: region.name
        })
        normalizer = normalizeVillage
        break

      default:
        return
    }
    const list = getList(response)

    regions.value = list.map(normalizer).filter(item => item.code)
  } catch (error) {
    console.error('获取下级行政区失败', error)
  } finally {
    loading.value = false
  }
}

/* ========================= */
/* 点击行政区域 */
/* ========================= */

async function handleRegionClick(region) {
  renderController?.abort()
  selectedCode.value = region.code
  currentRegion.value = region

  /**
   * 更新面包屑
   */
  const exists = breadcrumbs.value.findIndex(item => item.code === region.code)

  if (exists >= 0) {
    breadcrumbs.value = breadcrumbs.value.slice(0, exists + 1)
  } else {
    breadcrumbs.value.push({
      code: region.code,
      name: region.name,
      level: region.level
    })
  }

  /**
   * 五级已经到底
   */
  if (region.level >= LEVEL.VILLAGE) {
    await renderRegions([region])
    return
  }
  await loadChildren(region)
  await renderRegions(regions.value)
}

/* ========================= */
/* 面包屑 */
/* ========================= */

async function goBreadcrumb(index) {
  const target = breadcrumbs.value[index]
  breadcrumbs.value = breadcrumbs.value.slice(0, index + 1)
  currentRegion.value = target
  selectedCode.value = target.code
  await loadChildren(target)
  await renderRegions(regions.value)
}

/* ========================= */
/* 回到中国 */
/* ========================= */

async function goRoot() {
  breadcrumbs.value = []
  selectedCode.value = ''
  currentRegion.value = {
    code: '100000',
    name: '中国',
    level: LEVEL.COUNTRY
  }
  await loadRoot()
}

/* ========================= */
/* GeoJSON 缓存 */
/* ========================= */

const geoCache = new Map()

/* ========================= */
/* 加载 GeoJSON */
/* ========================= */

async function loadRegionGeoJSON(region, signal) {
  if (signal?.aborted) {
    return null
  }

  if (geoCache.has(region.code)) {
    return geoCache.get(region.code)
  }

  try {
    const data = await getGeoJSON(region.code, signal)
    if (signal?.aborted) {
      return null
    }
    geoCache.set(region.code, data)
    return data
  } catch (error) {
    if (error?.name === 'AbortError') {
      return null
    }
    console.warn(`GeoJSON 加载失败: ${region.code}`, error)
    return null
  }
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0

  async function run() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()))
  return results
}

/* ========================= */
/* 渲染行政区 */
/* ========================= */

function stampRegion(geojson, region) {
  const apply = feature => ({
    ...feature,
    properties: {
      ...(feature.properties || {}),
      code: region.code,
      name: region.name
    }
  })

  if (geojson?.type === 'FeatureCollection') {
    return {
      type: 'FeatureCollection',
      features: (geojson.features || []).map(apply)
    }
  }

  if (geojson?.type === 'Feature') {
    return apply(geojson)
  }

  return null
}

async function renderRegions(regionList) {
  if (!map) {
    return
  }
  renderController?.abort()
  const controller = new AbortController()
  renderController = controller
  const token = ++renderToken
  mapLoading.value = true
  try {
    /**
     * 加载 GeoJSON，并写上当前行政区代码，避免图形属性和列表代码对不上
     */
    const loaded = await mapWithConcurrency(regionList, 4, async region => {
      const geojson = await loadRegionGeoJSON(region, controller.signal)
      return geojson ? stampRegion(geojson, region) : null
    })

    if (token !== renderToken || !map) {
      return
    }

    /**
     * 删除旧图层
     */
    if (geoJsonLayer) {
      geoJsonLayer.remove()
      geoJsonLayer = null
    }
    const features = []
    loaded.forEach(geojson => {
      if (!geojson) {
        return
      }
      if (geojson.type === 'FeatureCollection') {
        features.push(...geojson.features)
      } else if (geojson.type === 'Feature') {
        features.push(geojson)
      }
    })

    if (!features.length) {
      return
    }

    /**
     * Leaflet GeoJSON
     */
    geoJsonLayer = L.geoJSON(
      {
        type: 'FeatureCollection',
        features
      },
      {
        style: defaultStyle,
        onEachFeature: bindFeatureEvents
      }
    )
    geoJsonLayer.addTo(map)
    /**
     * 自动缩放
     */
    const bounds = geoJsonLayer.getBounds()
    if (bounds.isValid()) {
      map.fitBounds(bounds, boundsPadding())
    }
  } finally {
    if (token === renderToken) {
      mapLoading.value = false
    }
  }
}

/* ========================= */
/* 默认样式 */
/* ========================= */

function defaultStyle() {
  return {
    color: '#409EFF',
    weight: 1.2,
    fillColor: '#409EFF',
    fillOpacity: 0.18
  }
}

/* ========================= */
/* Hover / Click */
/* ========================= */

function bindFeatureEvents(feature, layer) {
  const properties = feature.properties || {}

  const code =
    properties.code ||
    properties.adcode ||
    properties.first_gid ||
    properties['区划码'] ||
    properties['省级码'] ||
    properties['地级码'] ||
    properties['县级码']

  const name =
    properties.name ||
    properties['地名'] ||
    properties.cun ||
    properties.fullname ||
    properties.village ||
    properties.town ||
    properties.county ||
    properties.city ||
    properties.province ||
    properties['省']

  if (name) {
    layer.bindTooltip(name)
  }

  layer.on({
    mouseover() {
      layer.setStyle({
        weight: 2.5,
        color: '#F56C6C',
        fillColor: '#F56C6C',
        fillOpacity: 0.35
      })
    },

    mouseout() {
      geoJsonLayer.resetStyle(layer)
    },

    click() {
      const region =
        regions.value.find(item => code && String(item.code) === String(code)) || regions.value.find(item => name && item.name === name)

      if (region) {
        handleRegionClick(region)
      }
    }
  })
}
</script>
  
  
  <style scoped>
.admin-map {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

/* 地图 */

.map {
  width: 100%;
  height: 100%;
}

/* 左侧 */

.side-panel {
  position: absolute;
  z-index: 1000;
  left: 20px;
  top: 70px;
  width: 280px;
  max-height: calc(100vh - 100px);
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.panel-title {
  padding: 16px;
  border-bottom: 1px solid #eee;
  font-size: 17px;
  font-weight: 600;
}

.panel-title small {
  display: block;
  margin-top: 5px;
  color: #999;
  font-size: 12px;
  font-weight: normal;
}

.region-list {
  max-height: 70vh;
  overflow-y: auto;
}

.region-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid #f5f5f5;
}

.region-item:hover {
  background: #f5f7fa;
}

.region-item.active {
  color: #409eff;
  background: #ecf5ff;
}

.arrow {
  color: #aaa;
  font-size: 20px;
}

.loading,
.empty {
  padding: 30px;
  color: #999;
  text-align: center;
}

/* 面包屑 */

.breadcrumb {
  position: absolute;
  z-index: 1100;
  top: 20px;
  left: 20px;
  margin-left: 300px;
  padding: 10px 16px;
  background: white;
  border-radius: 6px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
}

.breadcrumb-item {
  color: #409eff;
  cursor: pointer;
}

.separator {
  margin: 0 8px;
  color: #bbb;
}

/* 信息 */

.info-panel {
  position: absolute;
  z-index: 1000;
  right: 20px;
  bottom: 20px;
  width: 300px;
  padding: 16px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.info-title {
  color: #999;
  font-size: 12px;
}

.info-name {
  margin-top: 5px;
  font-size: 18px;
  font-weight: 600;
}

.info-path {
  margin-top: 8px;
  color: #666;
  font-size: 13px;
  line-height: 1.6;
}

.info-level {
  margin-top: 8px;
  color: #409eff;
  font-size: 12px;
}

/* 地图 Loading */
.map-loading {
  position: absolute;
  z-index: 1200;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.loading-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 6px;
  box-shadow: 0 3px 15px rgba(0, 0, 0, 0.15);
}

.loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid #ddd;
  border-top-color: #409eff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-toggle {
  display: none;
  flex-shrink: 0;
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: #ecf5ff;
  color: #409eff;
  font-size: 13px;
  cursor: pointer;
}

@media (max-width: 768px) {
  .breadcrumb {
    top: 12px;
    left: 12px;
    right: 12px;
    margin-left: 0;
    max-width: none;
    overflow-x: auto;
    white-space: nowrap;
    -webkit-overflow-scrolling: touch;
  }

  .side-panel {
    left: 12px;
    right: 12px;
    top: auto;
    bottom: calc(72px + env(safe-area-inset-bottom));
    width: auto;
    max-height: 46vh;
  }

  .side-panel.collapsed .region-list,
  .side-panel.collapsed .loading,
  .side-panel.collapsed .empty {
    display: none;
  }

  .panel-title {
    padding: 12px 14px;
    font-size: 15px;
  }

  .panel-toggle {
    display: inline-flex;
    align-items: center;
  }

  .region-list {
    max-height: 32vh;
  }

  .region-item {
    min-height: 44px;
    padding: 12px 14px;
  }

  .info-panel {
    display: none;
  }

  .admin-map :deep(.leaflet-top.leaflet-left) {
    top: 64px;
    left: auto;
    right: 12px;
  }

  .admin-map :deep(.leaflet-bottom) {
    bottom: calc(132px + env(safe-area-inset-bottom));
  }
}
</style>