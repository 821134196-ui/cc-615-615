import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 本地模拟抄表接口：
 * 真实系统中此处会调用 IoT 抄表平台 / 上传到对象存储。
 * 本地实现把“照片”写成一张可识别的 SVG 文件到 storage/photos，
 * 并返回回执编号与 sha256，行为与外部接口一致。
 */
@Injectable()
export class MockMeterService {
  private readonly logger = new Logger(MockMeterService.name);
  private readonly photoDir = path.join(process.cwd(), 'storage', 'photos');

  constructor() {
    fs.mkdirSync(this.photoDir, { recursive: true });
  }

  /** 生成抄表/复核回执编号 */
  issueReceipt(prefix: string): string {
    const rand = crypto.randomBytes(6).toString('hex').toUpperCase();
    return `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${rand}`;
  }

  /** 模拟上传抄表照片，返回存储信息；原始照片保留，不覆盖 */
  uploadMeterPhoto(opts: { meterNo: string; value: number; periodKey: string; source: string }): {
    storagePath: string;
    originalFilename: string;
    contentType: string;
    sha256: string;
  } {
    const stamp = crypto.randomBytes(4).toString('hex');
    const filename = `${opts.meterNo}_${opts.periodKey}_${opts.source}_${stamp}.svg`;
    const label = opts.source === 'ONSITE' ? '现场复核实抄' : '例行抄表';
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300">
  <rect width="480" height="300" fill="#f4f6f8"/>
  <rect x="40" y="70" width="400" height="120" rx="10" fill="#1f2937"/>
  <text x="240" y="150" font-family="monospace" font-size="64" fill="#7dd3fc" text-anchor="middle">${String(opts.value).padStart(8, '0')}</text>
  <text x="240" y="230" font-family="sans-serif" font-size="20" fill="#111827" text-anchor="middle">表号 ${opts.meterNo} · ${opts.periodKey} 账期 · ${label}</text>
  <text x="240" y="262" font-family="sans-serif" font-size="13" fill="#6b7280" text-anchor="middle">模拟抄表影像（本地生成，仅用于演示）</text>
</svg>`;
    const storagePath = path.join(this.photoDir, filename);
    fs.writeFileSync(storagePath, svg, 'utf8');
    const sha256 = crypto.createHash('sha256').update(svg).digest('hex');
    this.logger.log(`[模拟抄表接口] 照片已落盘 ${filename}（${opts.meterNo} 读数 ${opts.value}）`);
    return {
      storagePath: filename,
      originalFilename: `meter_${opts.meterNo}_${opts.periodKey}.svg`,
      contentType: 'image/svg+xml',
      sha256,
    };
  }

  resolvePhotoPath(storagePath: string): string {
    // 防目录穿越
    const safe = path.basename(storagePath);
    return path.join(this.photoDir, safe);
  }
}
