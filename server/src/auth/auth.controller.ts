import { Body, Controller, Get, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IsString } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AuthUser, CurrentUser, JwtAuthGuard } from '../common/auth';

class LoginDto {
  @IsString()
  username!: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** 演示环境：免密登录，按用户名签发令牌 */
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      include: { resident: true },
    });
    if (!user) throw new UnauthorizedException('用户不存在');
    const token = await this.jwt.signAsync({ sub: user.id });
    return {
      token,
      user: {
        userId: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        residentId: user.resident?.id ?? null,
        accountNo: user.resident?.accountNo ?? null,
        address: user.resident?.address ?? null,
      },
    };
  }

  /** 演示环境：登录页可选用户列表 */
  @Get('users')
  async users() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      include: { resident: true },
    });
    return users.map((u) => ({
      username: u.username,
      name: u.name,
      role: u.role,
      accountNo: u.resident?.accountNo ?? null,
    }));
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
