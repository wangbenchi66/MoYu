// http/index.js — Axios 封装（拦截器、Loading 管理、GET/POST/PUT/DELETE）
import axios from "axios";
import { ElLoading, ElMessage } from 'element-plus';

axios.defaults.baseURL = import.meta.env.VITE_APP_BASE_API || ''
axios.defaults.headers['Content-Type'] = 'application/json;charset=UTF-8'
axios.defaults.timeout = 10000

// Loading 管理：延迟 200ms 显示，避免快请求闪烁
let loadingCount = 0
let loadingInstance = null
let loadingTimer = null

function showLoading() {
    loadingCount++
    if (loadingCount === 1 && !loadingInstance) {
        loadingTimer = setTimeout(() => {
            loadingTimer = null
            if (loadingCount > 0) {
                loadingInstance = ElLoading.service({
                    lock: true,
                    text: 'Loading',
                    background: 'rgba(0, 0, 0, 0.7)',
                })
            }
        }, 200)
    }
}

function hideLoading() {
    loadingCount = Math.max(0, loadingCount - 1)
    if (loadingCount === 0) {
        if (loadingTimer) {
            clearTimeout(loadingTimer)
            loadingTimer = null
        }
        if (loadingInstance) {
            loadingInstance.close()
            loadingInstance = null
        }
    }
}

// 请求拦截器
axios.interceptors.request.use(config => {
    if (localStorage.getItem("token") && config.headers.Authorization === undefined) {
        if (!config.headers) config.headers = {}
        config.headers.Authorization = 'Bearer ' + localStorage.getItem('token')
    }
    showLoading()
    return config
}, error => {
    ElMessage.error(error.message)
    hideLoading()
    return Promise.reject(error)
})

// 响应拦截器
axios.interceptors.response.use(response => {
    if (!response.data || typeof response.data.success === 'undefined') {
        hideLoading()
        return response
    }
    if (!response.data.success) {
        ElMessage.error(response.data.msg)
    }
    hideLoading()
    return response
}, error => {
    if (error.message === 'Network Error') {
        hideLoading()
        ElMessage.error('网络错误，请检查网络连接')
        return Promise.reject(error)
    }
    if (error.response && error.response.status === 401) {
        hideLoading()
        return Promise.reject(error)
    }
    const res = error.response && error.response.data
    if (res && !res.success) {
        ElMessage.error(res.msg)
        hideLoading()
        return Promise.reject(error)
    }
    ElMessage.error(error.message)
    hideLoading()
    return Promise.reject(error)
})

// 异步版本：直接返回 data，用 try/catch 处理错误
export const getAsync = async (url, params = {}, config = {}) => {
    if (params && Object.keys(params).length > 0) {
        url += (url.includes('?') ? '&' : '?') + new URLSearchParams(params).toString()
    }
    return await axios.get(url, config).then(response => response.data)
}

export const postAsync = async (url, params, config = {}) => {
    return await axios.post(url, params, config).then(response => response.data)
}

// 回调风格：返回 data 或 undefined，错误由拦截器弹窗
export const get = (url, params = {}, config = {}) => {
    if (params && Object.keys(params).length > 0) {
        url += (url.includes('?') ? '&' : '?') + new URLSearchParams(params).toString()
    }
    return axios.get(url, config).then(res => res.data)
}

export const post = (url, params, config = {}) => {
    return axios.post(url, params, config).then(res => res.data)
}

export const put = (url, params, config = {}) => {
    return axios.put(url, params, config).then(res => res.data)
}

export const del = (url, config = {}) => {
    return axios.delete(url, config).then(res => res.data)
}

export const upload = (url, params) => {
    return axios.post(url, params, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data)
}

export default { getAsync, postAsync, get, post, put, del, upload }
