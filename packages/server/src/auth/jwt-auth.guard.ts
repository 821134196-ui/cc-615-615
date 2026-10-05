import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';

export interface AuthedRequest extends Request {
  user?: { id: number; role: string; username: string };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少登录凭证');
    }
    const payload = await this.auth.verify(header.slice(7));
    req.user = { id: payload.sub, role: payload.role, username: payload.username };
    return true;
  }
}
