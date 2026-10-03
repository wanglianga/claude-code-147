import {
  Body, Controller, Get, Module, Post, UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { IsNotEmpty } from 'class-validator';
import { User } from '../entities';
import { CurrentUser, Public, Roles } from '../common/auth';

class LoginDto {
  @IsNotEmpty() username: string;
  @IsNotEmpty() password: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    private jwt: JwtService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() body: LoginDto) {
    const user = await this.users.findOne({ where: { username: body.username } });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const payload = { sub: user.id, username: user.username, name: user.name, role: user.role };
    return { token: this.jwt.sign(payload), user: payload };
  }

  @Get('me')
  me(@CurrentUser() user: any) {
    return user;
  }

  // 员工列表（保洁派单等下拉用）
  @Get('users')
  @Roles('owner', 'housekeeper', 'frontdesk')
  async listUsers() {
    const users = await this.users.find({ order: { id: 'ASC' } });
    return users.map((u) => ({ id: u.id, username: u.username, name: u.name, role: u.role }));
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [AuthController],
})
export class AuthModule {}
