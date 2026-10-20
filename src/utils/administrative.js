/**
 * 行政级别
 */
export const LEVEL = {
  COUNTRY: 0,
  PROVINCE: 1,
  CITY: 2,
  COUNTY: 3,
  TOWN: 4,
  VILLAGE: 5
}

/**
 * 行政级别名称
 */
export const LEVEL_NAME = {
  0: '全国',
  1: '省',
  2: '市',
  3: '区 / 县',
  4: '乡镇 / 街道',
  5: '村 / 社区'
}

/**
 * API 数据统一转换
 *
 * 锐多宝返回字段：
 *
 * province
 * city
 * county
 * town
 * village
 *
 * 不同层级的接口返回字段可能略有差异，
 * 所以统一在这里处理。
 */

/**
 * 省
 */
export function normalizeProvince(item) {
  return {
    code: item.code || item.provinceCode || item.provinceid,
    name: item.name || item.province || item.provincename,
    level: LEVEL.PROVINCE
  }
}

/**
 * 市
 */
export function normalizeCity(item) {
  return {
    code: item.code || item.cityCode || item.cityid,
    name: item.name || item.city || item.cityname,
    level: LEVEL.CITY
  }
}

/**
 * 区县
 */
export function normalizeCounty(item) {
  return {
    code: item.code || item.countyCode || item.countyid,
    name: item.name || item.county || item.countyname,
    level: LEVEL.COUNTY
  }
}

/**
 * 乡镇
 */
export function normalizeTown(item) {
  return {
    code: item.code || item.townCode || item.townid,
    name: item.name || item.town || item.townname,
    level: LEVEL.TOWN
  }
}

/**
 * 村
 */
export function normalizeVillage(item) {
  return {
    code: item.code || item.villageCode || item.villageid,
    name: item.name || item.village || item.villagename,
    level: LEVEL.VILLAGE
  }
}

/**
 * 从接口响应中获取 list
 */
export function getList(response) {
  if (Array.isArray(response)) {
    return response
  }

  if (Array.isArray(response?.result?.list)) {
    return response.result.list
  }

  if (Array.isArray(response?.data)) {
    return response.data
  }

  if (Array.isArray(response?.list)) {
    return response.list
  }

  return []
}
