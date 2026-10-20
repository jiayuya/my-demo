const API_PREFIX = '/api/admin'

/**
 * 通用 GET
 */
async function request(url, params = {}, signal) {
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value)
    }
  })

  const query = searchParams.toString()

  const requestUrl = `${API_PREFIX}${url}${query ? `?${query}` : ''}`

  const response = await fetch(requestUrl, { signal })

  if (!response.ok) {
    throw new Error(`请求失败：${response.status}`)
  }

  return response.json()
}

/**
 * 获取省级
 */
export function getProvinces(year = 2023) {
  return request('/api/tree/provinces', {
    year
  })
}

/**
 * 获取市级
 */
export function getCities({ year = 2023, province }) {
  return request('/api/tree/cities', {
    year,
    province
  })
}

/**
 * 获取区县
 */
export function getCounties({ year = 2023, province, city }) {
  return request('/api/tree/counties', {
    year,
    province,
    city
  })
}

/**
 * 获取乡镇 / 街道
 */
export function getTowns({ year = 2023, province, city, county }) {
  return request('/api/tree/towns', {
    year,
    province,
    city,
    county
  })
}

/**
 * 获取村 / 社区
 */
export function getVillages({ year = 2023, province, city, county, town }) {
  return request('/api/tree/villages', {
    year,
    province,
    city,
    county,
    town
  })
}

/**
 * 获取 GeoJSON
 *
 * getGsonDB 只返回导出路径，真正的图形在 filepath 指向的文件里。
 */
export async function getGeoJSON(code, signal) {
  const meta = await request('/getGsonDB', {
    code
  }, signal)

  if (meta?.type === 'Feature' || meta?.type === 'FeatureCollection') {
    return meta
  }

  const filepath = meta?.filepath

  if (!filepath) {
    throw new Error(`未返回 GeoJSON 路径：${code}`)
  }

  const fileUrl = /^https?:\/\//.test(filepath) ? filepath : `${API_PREFIX}${filepath}`
  const response = await fetch(fileUrl, { signal })

  if (!response.ok) {
    throw new Error(`GeoJSON 请求失败：${response.status}`)
  }

  const text = (await response.text()).replace(/^\uFEFF/, '')

  return JSON.parse(text)
}
