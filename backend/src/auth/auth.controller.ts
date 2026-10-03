import { Body, Controller, HttpException, HttpStatus, Post , HttpCode} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @HttpCode(200)
  @Post('login')
  async login(@Body() body: { username: string; password: string }) {
    const result = await this.auth.login(body?.username, body?.password);
    if (!result) {
      throw new HttpException('用户名或密码错误', HttpStatus.UNAUTHORIZED);
    }
    return result;
  }
}
