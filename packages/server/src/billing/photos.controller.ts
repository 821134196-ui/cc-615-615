import { Controller, Get, Param, ParseIntPipe, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PhotosService } from './photos.service';

@Controller('photos')
@UseGuards(JwtAuthGuard)
export class PhotosController {
  constructor(private photos: PhotosService) {}

  /** 取抄表/复核原始照片；原始照片永久保留，调整不删除、不覆盖 */
  @Get(':id/content')
  async content(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number; role: string },
    @Res() res: Response,
  ) {
    const photo = await this.photos.getAccessiblePhoto(id, user.id, user.role);
    const full = this.photos.resolvePath(photo.storagePath);
    if (!fs.existsSync(full)) {
      res.status(410).json({ message: '原始照片文件缺失（记录仍保留）' });
      return;
    }
    res.setHeader('Content-Type', photo.contentType);
    res.setHeader('X-Content-Sha256', photo.sha256);
    fs.createReadStream(full).pipe(res);
  }
}
