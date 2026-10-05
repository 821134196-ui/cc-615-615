import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MockMeterService } from '../meter/mock-meter.service';

@Injectable()
export class PhotosService {
  constructor(
    private prisma: PrismaService,
    private mockMeter: MockMeterService,
  ) {}

  /** 照片访问控制：仅照片所属读数对应的表主住户，或客服，可取原图 */
  async getAccessiblePhoto(photoId: number, userId: number, role: string) {
    const photo = await this.prisma.readingPhoto.findUnique({
      where: { id: photoId },
      include: { reading: { include: { meter: true } } },
    });
    if (!photo || (role !== 'AGENT' && photo.reading?.meter.userId !== userId)) {
      throw new NotFoundException('照片不存在');
    }
    return photo;
  }

  resolvePath(storagePath: string) {
    return this.mockMeter.resolvePhotoPath(storagePath);
  }
}
