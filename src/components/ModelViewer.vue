<template>
  <div class="model-viewer-container">
    <div class="controls">
      <div class="control-group">
        <label>选择模型：</label>
        <select v-model="selectedModel" @change="loadModel">
          <option value="">请选择模型</option>
          <!-- <option value="/model/base_basic_pbr.glb">base_basic_pbr.glb</option> -->
          <option value="/model/base_basic_shaded.glb">机器人</option>
          <!-- <option value="/model/base_basic_pbr_1.glb">base_basic_shaded.glb</option> -->
          <option value="/model/base_basic_shaded_1.glb">工地人员</option>
          <!-- <option value="/model/base.obj">base.obj</option> -->
        </select>
      </div>
      <div class="control-group">
        <button @click="resetCamera">重置视角</button>
        <button @click="toggleAutoRotate">{{ autoRotate ? '停止旋转' : '自动旋转' }}</button>
      </div>
      <div v-if="hasAnimations" class="control-group">
        <label>模型动画：</label>
        <button @click="playAnimation" :disabled="isPlaying">播放动画</button>
        <button @click="pauseAnimation" :disabled="!isPlaying">暂停动画</button>
        <button @click="stopAnimation">停止动画</button>
      </div>
      <div v-if="currentModel" class="control-group">
        <label>手动动画：</label>
        <button @click="startWaveAnimation">开始动画</button>
        <button @click="stopWaveAnimation">停止动画</button>
      </div>
    </div>
    <div ref="containerRef" class="model-container"></div>
    <div v-if="loading" class="loading">加载中...</div>
  </div>
</template>

<script setup lang="ts">
/**
 * Three.js 3D模型展示组件
 * 
 * Three.js 核心概念说明：
 * 1. Scene（场景）：所有3D对象的容器，类似于一个舞台
 * 2. Camera（相机）：定义观察者的视角，决定看到什么
 * 3. Renderer（渲染器）：将场景和相机渲染到canvas画布上
 * 4. Mesh（网格）：由几何体(Geometry)和材质(Material)组成的可见对象
 * 5. Light（灯光）：照亮场景，让模型可见且有立体感
 * 6. Controls（控制器）：处理用户交互，如旋转、缩放、平移
 */

import { ref, onMounted, onBeforeUnmount } from 'vue'
// Three.js 核心库
import * as THREE from 'three'
// GLTF/GLB 格式模型加载器（GLB是GLTF的二进制版本，更小更快）
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
// OBJ 格式模型加载器
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
// 轨道控制器：允许用户通过鼠标拖拽来旋转、缩放、平移场景
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// Vue响应式变量
const containerRef = ref<HTMLDivElement | null>(null) // 3D渲染容器的DOM引用
const selectedModel = ref('') // 当前选中的模型路径
const loading = ref(false) // 模型加载状态
const autoRotate = ref(false) // 是否自动旋转
const hasAnimations = ref(false) // 模型是否包含动画
const isPlaying = ref(false) // 动画是否正在播放

// Three.js核心对象（使用let因为需要在函数中赋值）
let scene: THREE.Scene // 场景对象，所有3D对象的容器
let camera: THREE.PerspectiveCamera // 透视相机，模拟人眼视角
let renderer: THREE.WebGLRenderer // WebGL渲染器，负责将3D场景渲染到2D画布
let controls: OrbitControls // 轨道控制器，处理鼠标交互
let currentModel: THREE.Group | null = null // 当前加载的模型（Group是多个对象的组合）
let animationId: number // 动画帧ID，用于取消动画循环

// 动画相关对象
let mixer: THREE.AnimationMixer | null = null // 动画混合器，用于播放GLB模型的骨骼动画
let animations: THREE.AnimationClip[] = [] // 模型包含的所有动画片段
let animationAction: THREE.AnimationAction | null = null // 当前播放的动画动作
let clock: THREE.Clock // 时钟对象，用于计算动画时间差

// 手动动画相关
let waveAnimationId: number | null = null // 手动动画的ID
let waveTarget: THREE.Object3D | null = null // 要动画的目标对象（比如手臂）

/**
 * 初始化Three.js场景
 * 这是整个3D展示的基础设置，包括场景、相机、渲染器、灯光等
 */
const initScene = () => {
  if (!containerRef.value) return

  // ========== 1. 创建场景 ==========
  // Scene是Three.js的核心，所有3D对象（模型、灯光、辅助线等）都需要添加到场景中
  scene = new THREE.Scene()
  // 设置场景背景色（浅灰色，十六进制颜色值）
  scene.background = new THREE.Color(0xf0f0f0)

  // ========== 2. 创建相机 ==========
  // 获取容器的宽高，用于设置相机的宽高比
  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight
  
  // PerspectiveCamera（透视相机）：模拟人眼视角，远处的物体看起来更小
  // 参数说明：
  //   75: 视野角度（FOV - Field of View），单位是度，越大视野越广
  //   width / height: 宽高比，保持画面不变形
  //   0.1: 近裁剪面，距离相机0.1以内的物体不显示
  //   1000: 远裁剪面，距离相机1000以外的物体不显示
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
  // 设置相机位置（x, y, z坐标）
  camera.position.set(5, 5, 5)
  // 让相机看向原点（0, 0, 0）
  camera.lookAt(0, 0, 0)

  // ========== 3. 创建渲染器 ==========
  // WebGLRenderer使用WebGL技术将3D场景渲染到canvas画布上
  // antialias: true 开启抗锯齿，让边缘更平滑
  renderer = new THREE.WebGLRenderer({ antialias: true })
  // 设置渲染器的输出尺寸
  renderer.setSize(width, height)
  // 启用阴影映射，让模型可以产生阴影效果
  renderer.shadowMap.enabled = true
  // 设置阴影类型为PCF（Percentage Closer Filtering），阴影边缘更柔和
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  // 将渲染器的canvas元素添加到DOM容器中
  containerRef.value.appendChild(renderer.domElement)

  // ========== 4. 添加轨道控制器 ==========
  // OrbitControls提供鼠标交互功能：
  //   - 左键拖拽：旋转场景
  //   - 滚轮：缩放场景
  //   - 右键拖拽：平移场景
  controls = new OrbitControls(camera, renderer.domElement)
  // 启用阻尼效果，让旋转更平滑自然（有惯性）
  controls.enableDamping = true
  // 阻尼系数，值越小惯性越大
  controls.dampingFactor = 0.05
  // 最小缩放距离，防止相机太靠近模型
  controls.minDistance = 1
  // 最大缩放距离，防止相机离模型太远
  controls.maxDistance = 50

  // ========== 5. 添加灯光 ==========
  // 环境光：从四面八方均匀照射，没有方向性，用于整体提亮
  // 参数：颜色(白色)，强度(0.6)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambientLight)

  // 方向光1：模拟太阳光，从特定方向照射，产生明暗对比
  // 参数：颜色(白色)，强度(0.8)
  const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8)
  // 设置光源位置
  directionalLight1.position.set(10, 10, 5)
  // 允许这个光源产生阴影
  directionalLight1.castShadow = true
  scene.add(directionalLight1)

  // 方向光2：补充光源，从另一个方向照射，减少阴影过暗
  const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4)
  directionalLight2.position.set(-10, 5, -5)
  scene.add(directionalLight2)

  // ========== 6. 添加辅助工具 ==========
  // 网格辅助线：帮助理解空间位置，显示地面网格
  // 参数：网格大小(10x10)，网格数量(10x10)
//   const gridHelper = new THREE.GridHelper(10, 10)
//   scene.add(gridHelper)

  // 坐标轴辅助线：显示X(红)、Y(绿)、Z(蓝)轴方向
  // 参数：轴的长度
//   const axesHelper = new THREE.AxesHelper(5)
//   scene.add(axesHelper)

  // ========== 7. 开始渲染循环 ==========
  // 创建时钟对象，用于计算动画时间差
  clock = new THREE.Clock()
  // 调用animate函数开始持续渲染场景
  animate()
}

/**
 * 加载3D模型的主函数
 * 根据文件格式选择对应的加载器，加载完成后自动调整相机位置
 */
const loadModel = async () => {
  // 如果取消选择模型，移除当前显示的模型
  if (!selectedModel.value) {
    if (currentModel) {
      scene.remove(currentModel)
      currentModel = null
    }
    return
  }

  loading.value = true

  try {
    // ========== 1. 移除旧模型和清理动画 ==========
    // 如果场景中已有模型，先移除它（避免多个模型重叠）
    if (currentModel) {
      scene.remove(currentModel)
      currentModel = null
    }
    // 清理之前的动画
    stopAnimation()
    stopWaveAnimation()
    mixer = null
    animations = []
    animationAction = null
    hasAnimations.value = false
    isPlaying.value = false

    const modelPath = selectedModel.value

    // ========== 2. 根据文件格式选择加载器 ==========
    if (modelPath.endsWith('.glb')) {
      // GLB格式：二进制格式，包含模型、材质、纹理等所有信息
      await loadGLBModel(modelPath)
    } else if (modelPath.endsWith('.obj')) {
      // OBJ格式：文本格式，只包含几何信息，需要手动添加材质
      await loadOBJModel(modelPath)
    }

    // ========== 3. 自动调整相机位置以适应模型 ==========
    // 这个功能让模型加载后自动居中显示，并且大小合适
    if (currentModel) {
      // Box3：创建一个包围盒，包含整个模型的最小和最大坐标
      const box = new THREE.Box3().setFromObject(currentModel)
      // 获取包围盒的中心点（模型的中心位置）
      const center = box.getCenter(new THREE.Vector3())
      // 获取包围盒的尺寸（模型的宽、高、深）
      const size = box.getSize(new THREE.Vector3())
      // 取最大的尺寸（用于计算相机距离）
      const maxDim = Math.max(size.x, size.y, size.z)
      
      // 计算相机应该距离模型多远才能完整看到模型
      // 将视野角度从度转换为弧度
      const fov = camera.fov * (Math.PI / 180)
      // 根据模型大小和视野角度计算相机距离
      const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2))
      
      // 设置相机位置：在模型中心的基础上，向斜上方偏移
      camera.position.set(center.x + cameraZ * 0.5, center.y + cameraZ * 0.5, center.z + cameraZ * 0.5)
      // 让相机看向模型中心
      camera.lookAt(center)
      // 设置控制器的目标点（旋转中心）为模型中心
      controls.target.copy(center)
      // 更新控制器状态
      controls.update()
    }
  } catch (error) {
    console.error('加载模型失败:', error)
    alert('加载模型失败，请检查模型文件是否存在')
  } finally {
    loading.value = false
  }
}

/**
 * 加载GLB格式模型
 * GLB是GLTF的二进制版本，包含模型、材质、纹理、动画等完整信息
 * 
 * @param path 模型文件路径
 * @returns Promise，加载成功时resolve，失败时reject
 */
const loadGLBModel = (path: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    // 创建GLTF加载器
    const loader = new GLTFLoader()
    // loader.load 接收4个参数：
    loader.load(
      path, // 1. 文件路径
      (gltf) => {
        console.log(gltf)
        // 2. 加载成功回调
        // gltf.scene 是加载后的场景对象（包含所有模型、灯光等）
        currentModel = gltf.scene
        // 将模型添加到场景中，这样才会显示出来
        scene.add(currentModel)
        
        // ========== 检查并设置动画 ==========
        // gltf.animations 包含模型的所有动画片段（如果有的话）
        if (gltf.animations && gltf.animations.length > 0) {
          // 保存动画片段
          animations = gltf.animations
          // 创建动画混合器（AnimationMixer）
          // 动画混合器用于控制动画的播放、暂停、速度等
          mixer = new THREE.AnimationMixer(currentModel)
          hasAnimations.value = true
          console.log(`模型包含 ${animations.length} 个动画片段:`, animations.map(a => a.name))
        } else {
          hasAnimations.value = false
          console.log('模型不包含动画')
        }
        
        resolve()
      },
      (progress) => {
        // 3. 加载进度回调（可选）
        // 可以用于显示加载进度条
        console.log('加载进度:', (progress.loaded / progress.total) * 100 + '%')
      },
      (error) => {
        // 4. 加载失败回调
        reject(error)
      }
    )
  })
}

/**
 * 加载OBJ格式模型
 * OBJ格式只包含几何信息（顶点、面），不包含材质，需要手动添加材质
 * 
 * @param path 模型文件路径
 * @returns Promise，加载成功时resolve，失败时reject
 */
const loadOBJModel = (path: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    // 创建OBJ加载器
    const loader = new OBJLoader()
    loader.load(
      path,
      (object) => {
        // object 是加载后的3D对象（通常是Group，包含多个Mesh）
        currentModel = object
        
        // ========== 为OBJ模型添加材质 ==========
        // OBJ文件通常不包含材质信息，需要手动添加
        // traverse：遍历模型的所有子对象（递归遍历）
        currentModel.traverse((child) => {
          // 检查子对象是否是Mesh（网格对象，可见的3D物体）
          if (child instanceof THREE.Mesh) {
            // MeshStandardMaterial：基于物理的材质，支持金属度和粗糙度
            // 参数说明：
            //   color: 0xcccccc - 颜色（浅灰色，十六进制）
            //   metalness: 0.3 - 金属度（0-1），0是完全非金属，1是完全金属
            //   roughness: 0.7 - 粗糙度（0-1），0是完全光滑，1是完全粗糙
            child.material = new THREE.MeshStandardMaterial({
              color: 0xcccccc,
              metalness: 0.3,
              roughness: 0.7
            })
            // 允许这个网格产生阴影
            child.castShadow = true
            // 允许这个网格接收阴影
            child.receiveShadow = true
          }
        })
        
        // 将模型添加到场景中
        scene.add(currentModel)
        resolve()
      },
      (progress) => {
        // 加载进度回调
        console.log('加载进度:', (progress.loaded / progress.total) * 100 + '%')
      },
      (error) => {
        // 加载失败回调
        reject(error)
      }
    )
  })
}

/**
 * 重置相机到初始位置
 * 将相机恢复到默认的观察角度
 */
const resetCamera = () => {
  // 设置相机位置为默认值（斜上方45度角）
  camera.position.set(5, 5, 5)
  // 让相机看向原点
  camera.lookAt(0, 0, 0)
  // 设置控制器的旋转中心为原点
  controls.target.set(0, 0, 0)
  // 更新控制器状态（应用新的设置）
  controls.update()
}

/**
 * 切换自动旋转功能
 * 开启后模型会围绕中心自动旋转，方便查看各个角度
 */
const toggleAutoRotate = () => {
  // 切换自动旋转状态
  autoRotate.value = !autoRotate.value
  // 设置控制器的自动旋转属性
  controls.autoRotate = autoRotate.value
}

/**
 * 播放模型动画（GLB格式的骨骼动画）
 * 如果模型包含动画，可以播放这些预定义的动画
 */
const playAnimation = () => {
  if (!mixer || animations.length === 0) {
    console.warn('模型不包含动画')
    return
  }
  
  // 如果已经有动画在播放，先停止它
  if (animationAction) {
    animationAction.stop()
  }
  
  // 选择第一个动画片段（如果有多个动画，可以扩展为选择特定动画）
  const clip = animations[0]
  // 创建动画动作（AnimationAction）
  // 动画动作控制动画的播放、循环、速度等
  animationAction = mixer.clipAction(clip)
  
  // 设置动画属性
  animationAction.reset() // 重置到初始状态
  animationAction.setLoop(THREE.LoopRepeat, Infinity) // 设置为循环播放，无限循环
  animationAction.clampWhenFinished = true // 播放结束后保持在最后一帧
  
  // 开始播放动画
  animationAction.play()
  isPlaying.value = true
  
  console.log(`播放动画: ${clip.name}`)
}

/**
 * 暂停动画
 */
const pauseAnimation = () => {
  if (animationAction) {
    animationAction.paused = true
    isPlaying.value = false
    console.log('动画已暂停')
  }
}

/**
 * 停止动画
 */
const stopAnimation = () => {
  if (animationAction) {
    animationAction.stop()
    animationAction = null
    isPlaying.value = false
    console.log('动画已停止')
  }
}

/**
 * 开始手动招手动画
 * 这个方法演示如何手动控制模型某个部分的旋转
 * 适用于没有骨骼动画的模型，或者想要自定义动画的情况
 */
const startWaveAnimation = () => {
  if (!currentModel) {
    console.warn('没有加载模型')
    return
  }
  
  // 停止之前的招手动画
  stopWaveAnimation()
  
  // ========== 查找要动画的对象 ==========
  // 这里需要根据你的模型结构调整
  // 如果你的模型有命名的手臂对象，可以通过名称查找
  // 例如：const arm = currentModel.getObjectByName('Arm_L')
  
  // 如果没有找到特定对象，就使用整个模型（作为示例）
  waveTarget = currentModel
  
  // 如果模型有子对象，可以尝试查找手臂
  // 遍历模型的所有子对象，查找可能的手臂对象
  currentModel.traverse((child) => {
    console.log(child)
    // 根据对象名称查找（常见的命名：arm, hand, leftArm等）
    const name = child.name.toLowerCase()
    if (name.includes('arm') || name.includes('hand') || name.includes('hand_l')) {
      waveTarget = child
      console.log('找到手臂对象:', child.name)
    }
  })
  
  if (!waveTarget) {
    waveTarget = currentModel
    console.log('未找到手臂对象，使用整个模型作为示例')
  }
  
  // 保存初始旋转
  const initialRotation = waveTarget.rotation.y
  
  // 创建招手动画
  let time = 0
  const animateWave = () => {
    time += 0.02 // 时间步长，控制动画速度
    
    if (waveTarget) {
      // 使用正弦函数创建来回摆动的效果
      // Math.sin(time) 产生 -1 到 1 之间的值
      // 乘以角度（弧度）控制摆动幅度
      // 这里让模型在Y轴（垂直轴）上旋转，模拟招手
      waveTarget.rotation.y = initialRotation + Math.sin(time) * 0.5
      
      // 也可以同时控制其他轴，比如：
      // waveTarget.rotation.x = Math.sin(time * 0.5) * 0.3 // X轴轻微摆动
    }
    
    waveAnimationId = requestAnimationFrame(animateWave)
  }
  
  animateWave()
  console.log('开始招手动画')
}

/**
 * 停止手动招手动画
 */
const stopWaveAnimation = () => {
  if (waveAnimationId !== null) {
    cancelAnimationFrame(waveAnimationId)
    waveAnimationId = null
    
    // 恢复初始状态（可选）
    if (waveTarget) {
      // waveTarget.rotation.y = 0 // 如果需要恢复到初始状态
    }
    
    console.log('停止招手动画')
  }
}

/**
 * 动画循环函数
 * 这是Three.js的核心，每一帧都会调用这个函数来更新和渲染场景
 * 类似于游戏的主循环
 */
const animate = () => {
  // requestAnimationFrame：浏览器提供的API，在下一帧调用回调函数
  // 通常每秒60次（60fps），与屏幕刷新率同步
  // 返回一个ID，用于取消动画循环
  animationId = requestAnimationFrame(animate)
  
  // 计算时间差（deltaTime），用于动画更新
  // Clock.getDelta()返回自上次调用以来的时间差（秒）
  // 这对于动画混合器很重要，确保动画以正确的速度播放
  const delta = clock.getDelta()
  
  // ========== 更新动画混合器 ==========
  // 如果存在动画混合器，需要每帧更新它
  // update方法会根据时间差更新动画状态
  if (mixer) {
    mixer.update(delta)
  }
  
  // 更新控制器（如果启用了阻尼或自动旋转，需要每帧更新）
  controls.update()
  
  // 渲染场景：将场景和相机的内容绘制到canvas上
  // 这是实际显示3D画面的关键步骤
  renderer.render(scene, camera)
}

/**
 * 处理窗口大小变化
 * 当浏览器窗口大小改变时，调整相机和渲染器的尺寸
 * 确保画面不变形且填满容器
 */
const handleResize = () => {
  if (!containerRef.value) return
  
  // 获取新的容器尺寸
  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight
  
  // 更新相机的宽高比（避免画面变形）
  camera.aspect = width / height
  // 更新相机的投影矩阵（应用新的宽高比）
  camera.updateProjectionMatrix()
  
  // 更新渲染器的输出尺寸（让canvas填满容器）
  renderer.setSize(width, height)
}

/**
 * Vue生命周期钩子：组件挂载后执行
 * 初始化3D场景并监听窗口大小变化
 */
onMounted(() => {
  // 初始化Three.js场景（创建场景、相机、渲染器等）
  initScene()
  // 监听窗口大小变化事件，自动调整画面尺寸
  window.addEventListener('resize', handleResize)
})

/**
 * Vue生命周期钩子：组件卸载前执行
 * 清理资源，防止内存泄漏
 */
onBeforeUnmount(() => {
  // 移除窗口大小变化监听器
  window.removeEventListener('resize', handleResize)
  
  // 停止所有动画
  stopAnimation()
  stopWaveAnimation()
  
  // 取消动画循环（停止渲染）
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
  
  // 清理动画混合器
  if (mixer) {
    mixer.stopAllAction()
    mixer = null
  }
  
  // 释放渲染器资源（清理WebGL上下文和内存）
  if (renderer) {
    renderer.dispose()
  }
  
  // 从DOM中移除canvas元素
  if (containerRef.value && renderer?.domElement) {
    containerRef.value.removeChild(renderer.domElement)
  }
})
</script>

<style scoped>
.model-viewer-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.controls {
  padding: 20px;
  background: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  gap: 20px;
  align-items: center;
  flex-wrap: wrap;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.control-group label {
  font-weight: 500;
  color: #333;
}

.control-group select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  min-width: 200px;
}

.control-group button {
  padding: 8px 16px;
  background: #42b883;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.3s;
}

.control-group button:hover:not(:disabled) {
  background: #35a372;
}

.control-group button:disabled {
  background: #ccc;
  cursor: not-allowed;
  opacity: 0.6;
}

.model-container {
  flex: 1;
  width: 100%;
  position: relative;
}

.loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 20px 40px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border-radius: 8px;
  font-size: 16px;
  z-index: 100;
}
</style>
