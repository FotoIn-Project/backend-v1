import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
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
import { JwtService } from 'src/utils/jwt/jwt.service';
import { VerifyAccountDto } from './dto/verification.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly userService: UsersService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService
  ) {}

  // feature login
  async login(loginUserDto: LoginUserDto): Promise<any> {
    const { email, password } = loginUserDto;
    this.logger.log(`[login] Attempting to log in user with email: ${email}`);

    // Check if email is registered
    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user) {
      this.logger.warn(`[login] Login failed: Email ${email} is not registered`);
      throw new HttpException('Email is not registered', HttpStatus.UNAUTHORIZED);
    }

    // Verify the password
    const isPasswordValid = await this.validatePassword(user, password);
    if (!isPasswordValid) {
      this.logger.warn(`[login] Login failed: Invalid password for email ${email}`);
      throw new HttpException('Invalid password', HttpStatus.UNAUTHORIZED);
    }

    if (!user.is_verified) {
      this.logger.warn(`[login] Login failed: User ${email} is not verified`);
      throw new HttpException('User is not verified', HttpStatus.UNAUTHORIZED);
    }

    // Generate JWT token
    const token = await this.jwtService.generateToken(user.id.toString());
    this.logger.log(`[login] User ${email} logged in successfully`);

    return { token };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<any> {
    const { email } = forgotPasswordDto;
    this.logger.log(`[forgotPassword] Processing forgot password for email: ${email}`);
    try {
      const user = await this.userService.findByEmail(email);
      if (!user) {
        this.logger.warn(`[forgotPassword] Forgot password failed: Email ${email} not found`);
        throw new HttpException('Email not found', HttpStatus.NOT_FOUND);
      }

      // Generate a 4-digit random token
      const token = Math.floor(1000 + Math.random() * 9000);
      const saveTokenFailed = await this.userService.saveResetPasswordToken(user.id, token);

      if (saveTokenFailed) {
        this.logger.error(`[forgotPassword] Failed to generate reset token for email ${email}`);
        throw new HttpException('Failed to generate reset token', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      const resetLink = `https://yourapp.com/reset-password?resetToken=${token}`; // TODO change link
      await this.emailService.sendEmailForgotPassword(email, resetLink);
      this.logger.log(`[forgotPassword] Forgot password email sent to ${email}`);

      return {statusCode : 200,  message: 'Forgot password email has been sent to your email address' };
    } catch (error) {
      this.logger.error(`[forgotPassword] Failed to process forgot password request for email ${email}`, error.stack);
      throw new HttpException('Failed to process forgot password request', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async verifyAccount(verifyAccountDto: VerifyAccountDto): Promise<any> {
    const { email, verificationCode } = verifyAccountDto;
    this.logger.log(`[verifyAccount] Verifying account for email: ${email}`);
    const user = await this.usersRepository.findOne({ where: { email } });

    if (!user) {
      this.logger.warn(`[verifyAccount] Verification failed: User with email ${email} not found`);
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (user.verified_code !== verificationCode) {
      this.logger.warn(`[verifyAccount] Verification failed: Invalid verification code for email ${email}`);
      throw new HttpException('Invalid verification code', HttpStatus.BAD_REQUEST);
    }

    user.is_verified = true;
    await this.usersRepository.save(user);
    this.logger.log(`[verifyAccount] Account verified successfully for email ${email}`);

    return {
      statusCode: 200,
      message: 'Account verified successfully',
      data: {
        userId: user.id,
        email: user.email,
      },
    };
  }

  async resetPassword(resetPassword: ResetPasswordDto): Promise<any> {
    const { resetToken, newPassword } = resetPassword;
    this.logger.log(`[resetPassword] Resetting password with token: ${resetToken}`);
    try {
      const user = await this.userService.findByResetToken(resetToken);
      if (!user) {
        this.logger.warn(`[resetPassword] Reset password failed: Invalid or expired reset token`);
        throw new HttpException('Invalid or expired reset token', HttpStatus.UNAUTHORIZED);
      }

      user.password = await bcrypt.hash(newPassword, 10);
      user.reset_password_token = null;
      await this.usersRepository.save(user);
      this.logger.log(`[resetPassword] Password reset successfully for user with token: ${resetToken}`);

      return { statusCode : 200,  message: 'Password has been reset successfully' };
    } catch (error) {
      this.logger.error(`[resetPassword] Failed to reset password for token ${resetToken}`, error.stack);
      throw new HttpException('Failed to reset password', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    this.logger.log(`[validatePassword] Validating password for user: ${user.email}`);
    return await bcrypt.compare(password, user.password);
  }
}
