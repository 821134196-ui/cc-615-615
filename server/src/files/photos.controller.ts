import { Controller, Get, NotFoundException, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthUser, CurrentUser, JwtAuthGuard } from '../common/auth';
import { ROLES } from '../common/constants';
import { PrismaService } from '../prisma.service';

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 生成模拟抄表照片（SVG 燃气表表盘） */
export function meterPhotoSvg(opts: {
  meterNo: string;
  value: number;
  takenAt: Date;
  label: string;
}): string {
  const digits = String(opts.value).padStart(6, '0').split('');
  const dateStr = opts.takenAt.toISOString().slice(0, 10);
  const digitBoxes = digits
    .map((d, i) => {
      const x = 40 + i * 62;
      return `
      <rect x="${x}" y="150" width="56" height="80" rx="6" fill="#111" stroke="#444"/>
      <text x="${x + 28}" y="205" font-family="monospace" font-size="52" fill="#f5f5f5" text-anchor="middle">${d}</text>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320">
  <rect width="480" height="320" fill="#2b2f36"/>
  <rect x="16" y="16" width="448" height="288" rx="14" fill="#3a4048" stroke="#555" stroke-width="2"/>
  <text x="240" y="60" font-family="sans-serif" font-size="22" fill="#cfd8dc" text-anchor="middle">膜式燃气表 G2.5</text>
  <text x="240" y="88" font-family="monospace" font-size="16" fill="#90a4ae" text-anchor="middle">No. ${esc(opts.meterNo)}</text>
  ${digitBoxes}
  <text x="432" y="250" font-family="sans-serif" font-size="16" fill="#90a4ae" text-anchor="end">m³</text>
  <text x="24" y="290" font-family="monospace" font-size="14" fill="#78909c">${dateStr} · ${esc(opts.label)} · 模拟抄表照片</text>
</svg>`;
}

/**
 * 抄表照片：住户只能看自己表计的照片，客服可看全部。
 * 照片资源按令牌寻址，但令牌本身不作鉴权——一律校验归属。
 */
@Controller('files/photos')
@UseGuards(JwtAuthGuard)
export class PhotosController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':token')
  async get(@CurrentUser() user: AuthUser, @Param('token') token: string, @Res() res: Response) {
    const reading = await this.prisma.meterReading.findFirst({
      where: { photoToken: token },
      include: { meter: true },
    });
    const receipt = reading
      ? null
      : await this.prisma.meterReceipt.findFirst({
          where: { photoToken: token },
          include: { meter: true },
        });
    const meter = reading?.meter ?? receipt?.meter;
    if (!meter) throw new NotFoundException('照片不存在');
    if (user.role !== ROLES.AGENT) {
      const owner = await this.prisma.resident.findUnique({ where: { id: meter.residentId } });
      if (!owner || owner.id !== user.residentId) throw new NotFoundException('照片不存在');
    }
    const svg = meterPhotoSvg({
      meterNo: meter.meterNo,
      value: reading?.value ?? receipt!.value,
      takenAt: reading?.date ?? receipt!.takenAt,
      label: receipt ? '现场复核' : reading!.kind === 'ACTUAL' ? '实抄' : '估抄',
    });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(svg);
  }
}
