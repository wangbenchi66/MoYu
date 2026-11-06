import test from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions } from '../electron/version-compare.js'

test('主次版本号比较', () => {
    assert.equal(compareVersions('0.0.14', '0.0.13'), 1)
    assert.equal(compareVersions('0.0.13', '0.0.14'), -1)
    assert.equal(compareVersions('1.2.3', '1.2.3'), 0)
    assert.equal(compareVersions('1.10.0', '1.9.9'), 1)
})

test('支持 v 前缀与缺省段', () => {
    assert.equal(compareVersions('v0.0.14', '0.0.14'), 0)
    assert.equal(compareVersions('1.2', '1.2.0'), 0)
})

test('正式版高于预发布版', () => {
    assert.equal(compareVersions('1.0.0', '1.0.0-beta.1'), 1)
    assert.equal(compareVersions('1.0.0-beta.1', '1.0.0'), -1)
    assert.equal(compareVersions('1.0.0-alpha', '1.0.0-beta'), -1)
})
