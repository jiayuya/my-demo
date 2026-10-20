<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

interface SearchItem {
  name: string
  address: string
  lat: number
  lng: number
}

interface NominatimItem {
  name?: string
  display_name: string
  lat: string
  lon: string
}

type SearchTab = 'place' | 'coord' | 'nearby'

interface VillageProps {
  villageName?: string
  streetName?: string
  districtName?: string
  cityName?: string
  proviceName?: string
}

interface VillageItem {
  name: string
  address: string
}

interface DatasetView {
  id: string
  fileName: string
  title: string
  subtitle: string
  count: number
  color: string
  villages: VillageItem[]
}

const DATASET_COLORS = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#ea580c',
  '#4f46e5',
  '#0f766e',
  '#ca8a04',
  '#be123c',
  '#65a30d',
  '#0284c7',
  '#9333ea',
  '#b45309',
]
const VILLAGE_LABEL_MIN_ZOOM = 14

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const mapEl = ref<HTMLDivElement | null>(null)
const collapsed = ref(false)
const activeTab = ref<SearchTab>('place')
const placeQuery = ref('')
const coordQuery = ref('')
const nearbyQuery = ref('')
const status = ref('')
const statusError = ref(false)
const results = ref<SearchItem[]>([])

const dataCollapsed = ref(false)
const dataQuery = ref('')
const dataStatus = ref('正在加载区域数据...')
const dataStatusError = ref(false)
const datasets = ref<DatasetView[]>([])
const expandedId = ref<string | null>(null)
const activeId = ref<string | null>(null)
const activeVillageKey = ref<string | null>(null)

let map: L.Map | null = null
let resultLayer: L.LayerGroup | null = null
let markers: L.Marker[] = []
const datasetLayers = new Map<string, L.GeoJSON>()
const villageLayers = new Map<string, L.Layer>()

const visibleDatasets = computed(() => {
  const query = dataQuery.value.trim().toLowerCase()
  return datasets.value
    .map((dataset) => {
      const datasetText = `${dataset.title} ${dataset.subtitle} ${dataset.fileName}`.toLowerCase()
      const datasetMatched = !query || datasetText.includes(query)
      const matchedVillages = query
        ? dataset.villages.filter((village) => `${village.name} ${village.address}`.toLowerCase().includes(query))
        : []
      const listedVillages = query
        ? matchedVillages.length
          ? matchedVillages
          : datasetMatched
            ? dataset.villages
            : []
        : expandedId.value === dataset.id
          ? dataset.villages
          : []
      return {
        ...dataset,
        listedVillages,
        visible: datasetMatched || matchedVillages.length > 0,
      }
    })
    .filter((dataset) => dataset.visible)
})

function setStatus(text: string, isError = false) {
  status.value = text
  statusError.value = isError
}

function clearResults() {
  resultLayer?.clearLayers()
  markers = []
  results.value = []
  setStatus('')
}

function flyTo(lat: number, lng: number, zoom = 15) {
  map?.flyTo([lat, lng], zoom, { duration: 0.8 })
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function toSearchItem(item: NominatimItem): SearchItem {
  return {
    name: item.name || item.display_name.split(',')[0],
    address: item.display_name,
    lat: Number(Number(item.lat).toFixed(5)),
    lng: Number(Number(item.lon).toFixed(5)),
  }
}

function renderResults(items: SearchItem[]) {
  resultLayer?.clearLayers()
  markers = []
  results.value = items

  if (!items.length || !resultLayer || !map) {
    if (!items.length) setStatus('未找到结果', true)
    return
  }

  markers = items.map((item, index) => {
    const marker = L.marker([item.lat, item.lng])
    marker.bindPopup(
      `<strong>${index + 1}. ${escapeHtml(item.name)}</strong><br>` +
        `<span style="color:#64748b;font-size:12px">${escapeHtml(item.address || '')}<br>${item.lat}, ${item.lng}</span>`,
    )
    resultLayer?.addLayer(marker)
    return marker
  })

  if (items.length === 1) {
    flyTo(items[0].lat, items[0].lng)
    markers[0].openPopup()
  } else {
    map.fitBounds(L.latLngBounds(items.map((item) => [item.lat, item.lng])), {
      padding: [48, 48],
      maxZoom: 15,
    })
  }

  setStatus(`找到 ${items.length} 个结果`)
}

function focusResult(index: number) {
  const item = results.value[index]
  const marker = markers[index]
  if (!item || !marker) return
  flyTo(item.lat, item.lng)
  marker.openPopup()
}

function parseCoord(text: string) {
  const match = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,，\s]\s*(-?\d+(?:\.\d+)?)$/)
  if (!match) return null
  const lat = Number(match[1])
  const lng = Number(match[2])
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

async function requestNominatim(params: Record<string, string>) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error('搜索失败')
  return (await response.json()) as NominatimItem[]
}

async function searchPlace(query: string) {
  const data = await requestNominatim({
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: '8',
    'accept-language': 'zh-CN',
  })
  return data.map(toSearchItem)
}

async function searchNearby(keyword: string) {
  if (!map) return []
  const center = map.getCenter()
  const data = await requestNominatim({
    q: keyword,
    format: 'json',
    addressdetails: '1',
    limit: '8',
    'accept-language': 'zh-CN',
    viewbox: [center.lng - 0.08, center.lat + 0.06, center.lng + 0.08, center.lat - 0.06].join(','),
    bounded: '1',
  })
  return data.map(toSearchItem)
}

async function runPlaceSearch() {
  const query = placeQuery.value.trim()
  if (!query) {
    setStatus('请输入地名关键词', true)
    return
  }
  setStatus('正在搜索...')
  try {
    renderResults(await searchPlace(query))
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '搜索失败', true)
  }
}

function runCoordSearch() {
  const coord = parseCoord(coordQuery.value)
  if (!coord) {
    setStatus('坐标格式错误，请使用：纬度,经度', true)
    return
  }

  renderResults([
    {
      name: '坐标定位',
      address: `${coord.lat}, ${coord.lng}`,
      lat: Number(coord.lat.toFixed(5)),
      lng: Number(coord.lng.toFixed(5)),
    },
  ])
}

async function runNearbySearch() {
  const query = nearbyQuery.value.trim()
  if (!query) {
    setStatus('请输入周边关键词', true)
    return
  }
  setStatus('正在搜索周边...')
  try {
    renderResults(await searchNearby(query))
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '周边搜索失败', true)
  }
}

function uniqueProp(features: Feature<Geometry, VillageProps>[], key: keyof VillageProps) {
  return [...new Set(features.map((feature) => feature.properties?.[key]).filter((value): value is string => Boolean(value)))]
}

function datasetStyle(id: string, active: boolean): L.PathOptions {
  const color = datasets.value.find((item) => item.id === id)?.color || '#2563eb'
  return {
    color: active ? '#ea580c' : color,
    weight: active ? 3 : 1.5,
    fillColor: color,
    fillOpacity: active ? 0.42 : 0.24,
  }
}

function applyDatasetStyles() {
  datasetLayers.forEach((layer, id) => {
    layer.setStyle(datasetStyle(id, activeId.value === id))
    if (activeId.value === id) layer.bringToFront()
  })

  const villageLayer = activeVillageKey.value ? villageLayers.get(activeVillageKey.value) : null
  if (villageLayer && 'setStyle' in villageLayer) {
    ;(villageLayer as L.Path).setStyle({
      color: '#ea580c',
      weight: 3,
      fillColor: '#fb923c',
      fillOpacity: 0.55,
    })
    if ('bringToFront' in villageLayer) (villageLayer as L.Path).bringToFront()
  }
}

function syncVillageLabels() {
  const container = map?.getContainer()
  if (!map || !container) return
  container.classList.toggle('village-labels-visible', map.getZoom() >= VILLAGE_LABEL_MIN_ZOOM)
}

function locateBounds(bounds: L.LatLngBounds, maxZoom: number) {
  if (!map || !bounds.isValid()) return
  const sidePadding = window.innerWidth > 1100 ? 390 : 48
  map.flyToBounds(bounds, {
    duration: 0.8,
    maxZoom,
    paddingTopLeft: [sidePadding, 48],
    paddingBottomRight: [sidePadding, 48],
  })
}

function focusDataset(id: string) {
  const layer = datasetLayers.get(id)
  if (!layer) return
  activeId.value = id
  activeVillageKey.value = null
  applyDatasetStyles()
  locateBounds(layer.getBounds(), 14)
}

function focusVillage(datasetId: string, index: number) {
  const key = `${datasetId}:${index}`
  const layer = villageLayers.get(key)
  if (!layer || !('getBounds' in layer)) return
  activeId.value = datasetId
  activeVillageKey.value = key
  expandedId.value = datasetId
  applyDatasetStyles()
  locateBounds((layer as L.Polygon).getBounds(), 16)
  if ('openPopup' in layer) (layer as L.Layer).openPopup()
}

function toggleDataset(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

async function loadGeoJsonFiles() {
  const response = await fetch('/geojson/index.json')
  if (!response.ok) throw new Error('读取 GeoJSON 目录失败')
  const files = (await response.json()) as unknown
  if (!Array.isArray(files)) throw new Error('GeoJSON 目录清单格式错误')
  return files.filter((name): name is string => typeof name === 'string' && name.toLowerCase().endsWith('.geojson'))
}

function collectionBounds(features: Feature<Geometry, VillageProps>[]) {
  const bounds = L.latLngBounds([])
  const walk = (coords: unknown) => {
    if (!Array.isArray(coords)) return
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      bounds.extend([coords[1], coords[0]])
      return
    }
    coords.forEach(walk)
  }
  features.forEach((feature) => walk(feature.geometry && 'coordinates' in feature.geometry ? feature.geometry.coordinates : null))
  return bounds.isValid() ? bounds : null
}

function assignDatasetColors(boundsList: (L.LatLngBounds | null)[]) {
  const colors: string[] = []
  boundsList.forEach((bounds, index) => {
    const used = new Set<string>()
    boundsList.forEach((other, otherIndex) => {
      const color = colors[otherIndex]
      if (otherIndex >= index || !color) return
      const nearby = Boolean(bounds && other && bounds.pad(0.2).intersects(other))
      if (nearby || otherIndex === index - 1) used.add(color)
    })
    colors.push(DATASET_COLORS.find((candidate) => !used.has(candidate)) ?? DATASET_COLORS[index % DATASET_COLORS.length])
  })
  return colors
}

async function loadDatasets() {
  const loaded: DatasetView[] = []
  const files = await loadGeoJsonFiles()
  const parsed: { fileName: string; collection: FeatureCollection<Geometry, VillageProps>; features: Feature<Geometry, VillageProps>[] }[] = []

  for (const fileName of files) {
    const response = await fetch(`/geojson/${fileName}`)
    if (!response.ok) throw new Error(`加载 ${fileName} 失败`)
    const text = (await response.text()).replace(/^\uFEFF/, '')
    const collection = JSON.parse(text) as FeatureCollection<Geometry, VillageProps>
    parsed.push({ fileName, collection, features: collection.features || [] })
  }

  const colors = assignDatasetColors(parsed.map((item) => collectionBounds(item.features)))

  for (const [index, item] of parsed.entries()) {
    const { fileName, collection, features } = item
    const id = fileName.replace(/\.geojson$/i, '')
    const color = colors[index]
    const streets = uniqueProp(features, 'streetName')
    const districts = uniqueProp(features, 'districtName')
    const cities = uniqueProp(features, 'cityName')
    const villages: VillageItem[] = []

    const layer = L.geoJSON(collection, {
      style: {
        color,
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.24,
      },
      onEachFeature(feature, featureLayer) {
        const props = feature.properties || {}
        const name = props.villageName || '未命名区域'
        const address = [props.streetName, props.districtName, props.cityName, props.proviceName].filter(Boolean).join(' · ')
        const villageIndex = villages.length
        villages.push({ name, address })
        villageLayers.set(`${id}:${villageIndex}`, featureLayer)
        featureLayer.bindTooltip(escapeHtml(name), {
          permanent: true,
          direction: 'center',
          className: 'village-label',
          opacity: 1,
        })
        featureLayer.bindPopup(
          `<strong>${escapeHtml(name)}</strong><br>` +
            `<span style="color:#64748b;font-size:12px">${escapeHtml(address)}</span>`,
        )
        featureLayer.on('click', () => {
          activeId.value = id
          activeVillageKey.value = `${id}:${villageIndex}`
          expandedId.value = id
          applyDatasetStyles()
        })
      },
    })

    if (map) layer.addTo(map)
    datasetLayers.set(id, layer)
    loaded.push({
      id,
      fileName,
      title: streets.join('、') || districts.join('、') || fileName,
      subtitle: [districts.join('、'), cities.join('、'), fileName].filter(Boolean).join(' · '),
      count: features.length,
      color,
      villages,
    })
  }

  datasets.value = loaded
  dataStatus.value = `已加载 ${loaded.length} 组区域，共 ${loaded.reduce((sum, item) => sum + item.count, 0)} 个范围`
  dataStatusError.value = false

  if (!map) return
  const bounds = L.latLngBounds([])
  datasetLayers.forEach((layer) => {
    const layerBounds = layer.getBounds()
    if (layerBounds.isValid()) bounds.extend(layerBounds)
  })
  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 12 })
  }
}

onMounted(() => {
  if (!mapEl.value) return

  map = L.map(mapEl.value, {
    center: [22.5431, 114.0579],
    zoom: 12,
    minZoom: 5,
    maxZoom: 18,
  })

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    minZoom: 5,
    maxZoom: 18,
    tileSize: 256,
  }).addTo(map)

  resultLayer = L.layerGroup().addTo(map)
  map.on('zoomend', syncVillageLabels)
  syncVillageLabels()

  if (window.matchMedia('(max-width: 640px)').matches) {
    collapsed.value = true
    dataCollapsed.value = true
  }

  loadDatasets().catch((error) => {
    dataStatus.value = error instanceof Error ? error.message : '区域数据加载失败'
    dataStatusError.value = true
  })

  requestAnimationFrame(() => map?.invalidateSize())
})

onBeforeUnmount(() => {
  map?.remove()
  map = null
  resultLayer = null
  markers = []
})
</script>

<template>
  <div class="map-page">
    <div ref="mapEl" class="map"></div>

    <div class="search-panel" :class="{ collapsed }">
      <div class="search-header">
        <span class="title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="7" />
            <path stroke-linecap="round" d="M21 21l-4.3-4.3" />
          </svg>
          地图搜索
        </span>
        <button
          type="button"
          class="toggle-btn"
          aria-label="展开或收起搜索"
          :aria-expanded="!collapsed"
          @click="collapsed = !collapsed"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 15l6-6 6 6" />
          </svg>
        </button>
      </div>

      <div class="search-collapsible">
        <div class="search-tabs">
          <button type="button" :class="{ active: activeTab === 'place' }" @click="activeTab = 'place'">
            地名搜索
          </button>
          <button type="button" :class="{ active: activeTab === 'coord' }" @click="activeTab = 'coord'">
            坐标搜索
          </button>
          <button type="button" :class="{ active: activeTab === 'nearby' }" @click="activeTab = 'nearby'">
            周边搜索
          </button>
        </div>

        <div class="search-body">
          <div class="panel" :class="{ active: activeTab === 'place' }">
            <div class="search-row">
              <input
                v-model="placeQuery"
                type="search"
                placeholder="例如：深圳市民中心、世界之窗"
                @keydown.enter="runPlaceSearch"
              />
              <button type="button" class="btn-primary" @click="runPlaceSearch">搜索</button>
            </div>
            <p class="hint">支持中文地名、地址关键词，返回多个匹配结果</p>
          </div>

          <div class="panel" :class="{ active: activeTab === 'coord' }">
            <div class="search-row">
              <input
                v-model="coordQuery"
                type="text"
                placeholder="例如：22.5431, 114.0579"
                @keydown.enter="runCoordSearch"
              />
              <button type="button" class="btn-primary" @click="runCoordSearch">定位</button>
            </div>
            <p class="hint">输入纬度,经度，直接跳转到该坐标</p>
          </div>

          <div class="panel" :class="{ active: activeTab === 'nearby' }">
            <div class="search-row">
              <input
                v-model="nearbyQuery"
                type="search"
                placeholder="例如：地铁站、公园、酒店"
                @keydown.enter="runNearbySearch"
              />
              <button type="button" class="btn-primary" @click="runNearbySearch">搜索</button>
            </div>
            <p class="hint">在当前地图视野附近搜索 POI，结果会标注在地图上</p>
          </div>

          <div class="search-actions">
            <button type="button" class="btn-secondary" @click="clearResults">清除结果</button>
          </div>
          <div class="status" :class="{ error: statusError }">{{ status }}</div>
        </div>

        <div class="results">
          <button
            v-for="(item, index) in results"
            :key="`${item.lat}-${item.lng}-${index}`"
            type="button"
            class="result-item"
            @click="focusResult(index)"
          >
            <strong>{{ index + 1 }}. {{ item.name }}</strong>
            <span>{{ item.address || `${item.lat}, ${item.lng}` }}</span>
          </button>
        </div>
      </div>
    </div>

    <div class="search-panel data-panel" :class="{ collapsed: dataCollapsed }">
      <div class="search-header">
        <span class="title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linejoin="round" d="M12 3l7 4v5c0 4.2-2.8 7.4-7 9-4.2-1.6-7-4.8-7-9V7l7-4z" />
          </svg>
          区域数据
        </span>
        <button
          type="button"
          class="toggle-btn"
          aria-label="展开或收起区域数据"
          :aria-expanded="!dataCollapsed"
          @click="dataCollapsed = !dataCollapsed"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 15l6-6 6 6" />
          </svg>
        </button>
      </div>

      <div class="search-collapsible">
        <div class="search-body">
          <div class="search-row">
            <input v-model="dataQuery" type="search" placeholder="搜索镇街、村名或文件名" />
          </div>
          <p class="hint">点击一组数据定位到整体范围，展开后可定位到单个村界。村名在放大到 14 级后显示</p>
          <div class="status" :class="{ error: dataStatusError }">{{ dataStatus }}</div>
        </div>

        <div class="results">
          <p v-if="datasets.length && !visibleDatasets.length" class="empty">没有匹配的区域</p>
          <div v-for="dataset in visibleDatasets" :key="dataset.id" class="dataset">
            <div class="dataset-row">
              <button
                type="button"
                class="result-item"
                :class="{ active: activeId === dataset.id && !activeVillageKey }"
                @click="focusDataset(dataset.id)"
              >
                <strong>
                  <i class="swatch" :style="{ background: dataset.color }"></i>
                  {{ dataset.title }}
                </strong>
                <span>{{ dataset.subtitle }} · {{ dataset.count }} 个范围</span>
              </button>
              <button
                type="button"
                class="expand-btn"
                :class="{ open: expandedId === dataset.id || dataQuery.trim() }"
                :aria-label="expandedId === dataset.id ? '收起村界' : '展开村界'"
                @click="toggleDataset(dataset.id)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
            <div v-if="dataset.listedVillages.length" class="village-list">
              <button
                v-for="village in dataset.listedVillages"
                :key="`${dataset.id}-${village.name}-${dataset.villages.indexOf(village)}`"
                type="button"
                class="result-item"
                :class="{ active: activeVillageKey === `${dataset.id}:${dataset.villages.indexOf(village)}` }"
                @click="focusVillage(dataset.id, dataset.villages.indexOf(village))"
              >
                <strong>{{ village.name }}</strong>
                <span>{{ village.address }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-page {
  position: relative;
  width: 100%;
  height: 100%;
}

.map {
  width: 100%;
  height: 100%;
}

.map :deep(.village-label) {
  background: rgba(15, 23, 42, 0.78);
  border: 0;
  border-radius: 4px;
  box-shadow: none;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  padding: 1px 6px;
  white-space: nowrap;
  pointer-events: none;
  display: none;
}

.map.village-labels-visible :deep(.village-label) {
  display: block;
}

.map :deep(.village-label::before) {
  display: none;
}

.data-panel {
  left: auto;
  right: 12px;
}

.data-panel .results {
  max-height: min(52vh, 520px);
}

.dataset-row {
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid #f1f5f9;
}

.dataset-row .result-item {
  flex: 1;
  border-bottom: 0;
}

.swatch {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 999px;
  vertical-align: 1px;
}

.expand-btn {
  width: 36px;
  border: 0;
  border-left: 1px solid #f1f5f9;
  border-radius: 0;
  background: #fff;
  color: #64748b;
  cursor: pointer;
  padding: 0;
}

.expand-btn:hover {
  background: #f8fafc;
  border-color: #f1f5f9;
}

.expand-btn svg {
  width: 16px;
  height: 16px;
  transition: transform 0.2s ease;
}

.expand-btn.open svg {
  transform: rotate(180deg);
}

.village-list {
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.village-list .result-item {
  padding-left: 22px;
}

.result-item.active {
  background: #eff6ff;
}

.empty {
  margin: 0;
  padding: 12px;
  font-size: 12px;
  color: #94a3b8;
}

.search-panel {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 1000;
  width: min(360px, calc(100vw - 24px));
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
  overflow: hidden;
  font-family: system-ui, -apple-system, sans-serif;
  text-align: left;
}

.search-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
}

.search-header .title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.search-header .title svg {
  width: 18px;
  height: 18px;
  color: #2563eb;
}

.toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: #f1f5f9;
  color: #475569;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
}

.toggle-btn:hover {
  background: #e2e8f0;
  border-color: transparent;
}

.toggle-btn svg {
  width: 18px;
  height: 18px;
  transition: transform 0.2s ease;
}

.search-collapsible {
  overflow: hidden;
  transition: max-height 0.25s ease, opacity 0.2s ease;
  max-height: 640px;
  opacity: 1;
}

.search-panel.collapsed .search-collapsible {
  max-height: 0;
  opacity: 0;
}

.search-panel.collapsed .toggle-btn svg {
  transform: rotate(180deg);
}

.search-tabs {
  border-top: 1px solid #e2e8f0;
  display: flex;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.search-tabs button {
  flex: 1;
  border: 0;
  background: transparent;
  padding: 10px 8px;
  font-size: 13px;
  color: #64748b;
  cursor: pointer;
  outline: none;
  border-radius: 0;
}

.search-tabs button.active {
  color: #0f172a;
  font-weight: 600;
  background: #fff;
  box-shadow: inset 0 -2px 0 #2563eb;
}

.search-body {
  padding: 12px;
}

.search-row {
  display: flex;
  gap: 8px;
}

.search-row input {
  flex: 1;
  height: 36px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0 10px;
  font-size: 14px;
  outline: none;
  color: #0f172a;
  background: #fff;
}

.search-row input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.search-row button,
.search-actions button {
  height: 36px;
  border: 0;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13px;
  cursor: pointer;
}

.btn-primary {
  background: #2563eb;
  color: #fff;
}

.btn-primary:hover {
  border-color: transparent;
}

.btn-secondary {
  background: #e2e8f0;
  color: #334155;
}

.btn-secondary:hover {
  border-color: transparent;
}

.hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.4;
}

.status {
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
  min-height: 16px;
}

.status.error {
  color: #dc2626;
}

.results {
  max-height: 240px;
  overflow: auto;
  border-top: 1px solid #e2e8f0;
}

.result-item {
  width: 100%;
  border: 0;
  border-bottom: 1px solid #f1f5f9;
  border-radius: 0;
  background: #fff;
  text-align: left;
  padding: 10px 12px;
  cursor: pointer;
}

.result-item:hover {
  background: #f8fafc;
  border-color: #f1f5f9;
}

.result-item strong {
  display: block;
  font-size: 13px;
  color: #0f172a;
  margin-bottom: 4px;
}

.result-item span {
  font-size: 12px;
  color: #64748b;
}

.panel {
  display: none;
}

.panel.active {
  display: block;
}
</style>
