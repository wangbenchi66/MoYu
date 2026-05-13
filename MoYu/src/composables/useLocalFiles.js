/**
 * useLocalFiles.js — 本地文件管理
 */
import { localDocuments, tabs, activeTabId, generateUniqueTabId } from './useAppState.js'
import { createLocalTextTab, createPageTab } from './useTabManager.js'

async function uploadLocalFiles(fileList) {
    const files = Array.from(fileList ?? [])
    if (!files.length) return

    for (const file of files) {
        try {
            const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
            const documentId = generateUniqueTabId()

            if (['txt', 'md', 'markdown', 'log', 'json'].includes(extension) || file.type.startsWith('text/')) {
                const content = await file.text()
                localDocuments.value.unshift({
                    id: documentId, fileName: file.name, type: 'local-text', content, size: file.size,
                })
                createLocalTextTab(file.name, content, documentId)
                continue
            }

            const objectUrl = URL.createObjectURL(file)
            localDocuments.value.unshift({
                id: documentId, fileName: file.name, type: 'local-file', url: objectUrl,
                objectUrl, mimeType: file.type, size: file.size,
            })
            createPageTab(objectUrl, {
                title: file.name.replace(/\.[^.]+$/, ''), subtitle: file.name, kind: 'page',
                objectUrl, fileName: file.name, mimeType: file.type, documentId,
            })
        } catch (e) {
            console.warn('[upload] 文件读取失败，已跳过:', file.name, e)
        }
    }
    localDocuments.value = localDocuments.value.slice(0, 12)
}

function openLocalDocument(documentItem) {
    if (documentItem.type === 'local-text') {
        createLocalTextTab(documentItem.fileName, documentItem.content, documentItem.id)
        return
    }
    createPageTab(documentItem.url, {
        title: documentItem.fileName.replace(/\.[^.]+$/, ''),
        subtitle: documentItem.fileName,
        objectUrl: documentItem.objectUrl, fileName: documentItem.fileName,
        mimeType: documentItem.mimeType, documentId: documentItem.id,
    })
}

function removeLocalDocument(documentId) {
    const documentItem = localDocuments.value.find((item) => item.id === documentId)
    if (documentItem?.objectUrl) URL.revokeObjectURL(documentItem.objectUrl)
    localDocuments.value = localDocuments.value.filter((item) => item.id !== documentId)
    tabs.value = tabs.value.filter((tab) => tab.documentId !== documentId)
    if (!tabs.value.length) {
        tabs.value = [{ id: 0, title: '工作台', url: 'about:blank', subtitle: '新标签页', kind: 'dashboard' }]
        activeTabId.value = 0
    } else if (!tabs.value.some((tab) => tab.id === activeTabId.value)) {
        activeTabId.value = tabs.value[0].id
    }
}

export { uploadLocalFiles, openLocalDocument, removeLocalDocument }
