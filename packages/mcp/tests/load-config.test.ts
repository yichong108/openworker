/**
 * load-config 表征测试：锁定空路径、缺文件、Cursor 对象形态与数组形态。
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { loadMcpServersFromConfig, writeMcpConfigFile } from '../src/load-config.js'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ow-mcp-'))
  dirs.push(dir)
  return dir
}

describe('loadMcpServersFromConfig', () => {
  it('路径为空返回 []', async () => {
    expect(await loadMcpServersFromConfig('')).toEqual([])
    expect(await loadMcpServersFromConfig('   ')).toEqual([])
  })

  it('文件不存在返回 []', async () => {
    const dir = await tempDir()
    expect(await loadMcpServersFromConfig(join(dir, 'missing.json'))).toEqual([])
  })

  it('空文件返回 []', async () => {
    const dir = await tempDir()
    const path = join(dir, 'mcp.json')
    await writeFile(path, '  \n', 'utf8')
    expect(await loadMcpServersFromConfig(path)).toEqual([])
  })

  it('解析 Cursor 对象形态 mcpServers', async () => {
    const dir = await tempDir()
    const path = join(dir, 'mcp.json')
    await writeFile(
      path,
      JSON.stringify({
        mcpServers: {
          github: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github']
          }
        }
      }),
      'utf8'
    )
    const servers = await loadMcpServersFromConfig(path)
    expect(servers).toHaveLength(1)
    expect(servers[0]).toMatchObject({
      name: 'github',
      enabled: true,
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github']
    })
    expect(servers[0]?.id).toBeTruthy()
  })

  it('解析根级服务器数组', async () => {
    const dir = await tempDir()
    const path = join(dir, 'mcp.json')
    await writeFile(
      path,
      JSON.stringify([
        {
          id: 'srv-1',
          name: 'local',
          enabled: true,
          command: 'node',
          args: ['server.js']
        }
      ]),
      'utf8'
    )
    expect(await loadMcpServersFromConfig(path)).toEqual([
      {
        id: 'srv-1',
        name: 'local',
        enabled: true,
        command: 'node',
        args: ['server.js']
      }
    ])
  })
})

describe('writeMcpConfigFile', () => {
  it('写出本应用 { mcpServers: [...] } 形态', async () => {
    const dir = await tempDir()
    const path = join(dir, 'mcp.json')
    const servers = [
      {
        id: 'a',
        name: 'A',
        enabled: false,
        command: 'npx',
        args: ['foo']
      }
    ]
    await writeMcpConfigFile(path, servers)
    const raw = await readFile(path, 'utf8')
    expect(raw.endsWith('\n')).toBe(true)
    expect(JSON.parse(raw)).toEqual({ mcpServers: servers })
  })

  it('configPath 为空抛错', async () => {
    await expect(writeMcpConfigFile('', [])).rejects.toThrow('mcp configPath cannot be empty')
  })
})
