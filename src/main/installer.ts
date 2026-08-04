import { spawn } from 'node:child_process'
import https from 'node:https'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { InstallStatus } from '../shared/types'

const INSTALL_SCRIPT_URL = 'https://omp.sh/install'

export async function installOmp(
  onStatus: (status: InstallStatus) => void
): Promise<boolean> {
  const platform = os.platform()

  if (platform === 'win32') {
    onStatus({
      type: 'error',
      message: 'Windows auto-install is not yet supported. Please run: irm https://omp.sh/install.ps1 | iex'
    })
    return false
  }

  onStatus({ type: 'downloading', progress: 0, message: 'Downloading installer...' })

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-gui-install-'))
  const scriptPath = path.join(tmpDir, 'install.sh')

  try {
    await downloadFile(INSTALL_SCRIPT_URL, scriptPath, (progress) => {
      onStatus({ type: 'downloading', progress, message: `Downloading installer... ${progress.toFixed(0)}%` })
    })

    onStatus({ type: 'installing', message: 'Running installer (may require password)...' })

    return new Promise((resolve) => {
      const proc = spawn('sh', [scriptPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PATH: '/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:' + (process.env.PATH || '')
        }
      })

      let output = ''

      proc.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8')
        output += text
        const lastLine = text.trim().split('\n').pop() || ''
        onStatus({ type: 'installing', message: lastLine || 'Installing...' })
      })

      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8')
        output += text
        const lastLine = text.trim().split('\n').pop() || ''
        onStatus({ type: 'installing', message: lastLine || 'Installing...' })
      })

      proc.on('close', (code) => {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true })
        } catch {
          // ignore cleanup errors
        }

        if (code === 0) {
          onStatus({ type: 'success' })
          resolve(true)
        } else {
          onStatus({
            type: 'error',
            message: `Install failed with code ${code}.\n${output.slice(-500)}`
          })
          resolve(false)
        }
      })
    })
  } catch (err) {
    onStatus({
      type: 'error',
      message: `Download failed: ${err instanceof Error ? err.message : String(err)}`
    })
    return false
  }
}

function downloadFile(
  url: string,
  dest: string,
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https
      .get(url, { redirect: 'follow' as any }, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`))
          return
        }

        const total = parseInt(response.headers['content-length'] || '0', 10)
        let downloaded = 0

        response.on('data', (chunk: Buffer) => {
          downloaded += chunk.length
          if (total > 0) {
            onProgress((downloaded / total) * 100)
          }
        })

        response.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve()
        })
      })
      .on('error', (err) => {
        fs.unlinkSync(dest)
        reject(err)
      })
  })
}
