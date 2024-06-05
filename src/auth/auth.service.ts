const jwt = require('jsonwebtoken');
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { Repository } from 'typeorm';
import { LoginUserDto } from './dto/login-user.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { UsersService } from 'src/users/users.service';
import { v4 as uuid } from 'uuid';
import * as bcrypt from 'bcrypt';
import { EmailService } from 'src/utils/email/email.service';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly userService: UsersService,
    private readonly emailService: EmailService,
  ) {}

  //feature login
  async login(loginUserDto: LoginUserDto): Promise<any> {
    const { email, password } = loginUserDto;

    // Check if email is registered
    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user) {
      throw new HttpException(
        'Email is not registered',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Verify the password
    const isPasswordValid = await this.validatePassword(user, password);
    if (!isPasswordValid) {
      throw new HttpException('Invalid password', HttpStatus.UNAUTHORIZED);
    }

    if (!user.is_verified) {
      throw new HttpException('User is not verified', HttpStatus.UNAUTHORIZED);
    }

    // Generate JWT token
    const accessToken = await this.generateToken(user.id.toString());

    return { accessToken };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<{ message: string }> {
    const { email } = forgotPasswordDto;
    try {
      const user = await this.userService.findByEmail(email);
      if (!user) {
        throw new HttpException('Email not found', HttpStatus.NOT_FOUND);
      }

      const token = uuid();
      const saveTokenFailed = await this.userService.saveResetPasswordToken(user.id, token);

      if (saveTokenFailed) {
        throw new HttpException('Failed to generate reset token', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      const resetLink = `https://yourapp.com/reset-password?resetToken=${token}`; // TODO change link
      await this.emailService.sendVerificationEmail(email, resetLink);

      return { message: 'Forgot password email has been sent to your email address' };
    } catch (error) {
      console.log(error);
      throw new HttpException(
        'Failed to process forgot password request',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async resetPassword(resetPassword: ResetPasswordDto): Promise<{ message: string }> {
    const { resetToken, newPassword } = resetPassword;

    try {
      const user = await this.userService.findByResetToken(resetToken);
      if (!user) {
        throw new HttpException('Invalid or expired reset token', HttpStatus.UNAUTHORIZED);
      }

      user.password = await bcrypt.hash(newPassword, 10);
      user.reset_password_token = null;
      await this.usersRepository.save(user);

      return { message: 'Password has been reset successfully' };
    } catch (error) {
      console.log(error);
      throw new HttpException(
        'Failed to reset password',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }



  async validatePassword(user: User, password: string): Promise<boolean> {
    return await bcrypt.compare(password, user.password);
  }

  //token function
  async generateToken(userId: string) {
    try {
      const payload = { userId: userId };
      const token = jwt.sign(payload, process.env.JWT_SECRECT, {
        expiresIn: '2h',
      });
      return token;
    } catch (error) {
      console.log('Error generate token : ', error);
      throw new Error('Failed to generate token');
    }
  }

  async verifyJwtToken(token: string) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRECT);
      return decoded;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
