import axios from "axios";
import { ElLoading, ElMessage } from 'element-plus';

axios.defaults.baseURL = import.meta.env.VITE_APP_BASE_API || ''
axios.defaults.headers['Content-Type'] = 'application/json;charset=UTF-8'
axios.defaults.timeout = 10000

let loading = ElLoading.service({})
loading.close()

// 请求拦截器
axios.interceptors.request.use(config => {
    if (localStorage.getItem("token") && config.headers.Authorization === undefined) {
        if (!config.headers) config.headers = {}
        config.headers.Authorization = 'Bearer ' + localStorage.getItem('token')
    }
    loading = ElLoading.service({
        lock: true,
        text: 'Loading',
        background: 'rgba(0, 0, 0, 0.7)',
    })
    return config
}, error => {
    ElMessage.error(error.message)
    loading.close()
    return
})

// 响应拦截器
axios.interceptors.response.use(response => {
    if (!response.data || typeof response.data.success === 'undefined') {
        loading.close()
        return response
    }
    if (!response.data.success) {
        ElMessage.error(response.data.msg)
    }
    loading.close()
    return response
}, error => {
    if (error.message === 'Network Error') {
        loading.close()
        ElMessage.error('网络错误，请检查网络连接')
        return Promise.reject(error)
    }
    if (error.response && error.response.status === 401) {
        loading.close()
        return Promise.reject(error)
    }
    var res = error.response && error.response.data
    if (res && !res.success) {
        ElMessage.error(res.msg)
        loading.close()
        return Promise.reject(error)
    }
    ElMessage.error(error.message)
    loading.close()
    return Promise.reject(error)
})

const headerParams = {
    headers: {
        'Content-Type': 'application/json;charset=UTF-8'
    }
}

export const getAsync = async (url, params = {}, headerOptions = headerParams) => {
    if (params && Object.keys(params).length > 0) {
        url += (url.includes('?') ? '&' : '?') + new URLSearchParams(params).toString()
    }
    return await axios.get(url, headerOptions).then(res => res.data, () => undefined)
}

export const get = (url, params = {}, headerOptions = headerParams) => {
    if (params && Object.keys(params).length > 0) {
        url += (url.includes('?') ? '&' : '?') + new URLSearchParams(params).toString()
    }
    return axios.get(url, headerOptions).then(res => res.data, () => undefined)
}

export const postAsync = async (url, params, headerOptions = headerParams) => {
    return await axios.post(url, params, headerOptions).then(res => res.data, error => {
        ElMessage.error(error.message)
    })
}

export const post = async (url, params, headerOptions = headerParams) => {
    return await axios.post(url, params, headerOptions).then(res => res.data, error => {
        ElMessage.error(error.message)
    })
}

export const put = (url, params) => {
    return axios.put(url, params).then(res => res.data, error => {
        ElMessage.error(error.message)
    })
}

export const del = (url, params) => {
    return axios.delete(url, params).then(res => res.data, error => {
        ElMessage.error(error.message)
    })
}

export const upload = (url, params) => {
    return axios.post(url, params, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data, error => {
        ElMessage.error(error.message)
    })
}

export default { getAsync, postAsync, get, post, put, del, upload }
