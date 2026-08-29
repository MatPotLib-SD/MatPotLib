import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

export const EXPO_CLIENT = 'EXPO_CLIENT';

/** Minimal Expo client surface used by AlertsService (mockable in tests). */
export interface ExpoLike {
  chunkPushNotifications(messages: ExpoPushMessage[]): ExpoPushMessage[][];
  sendPushNotificationsAsync(
    messages: ExpoPushMessage[],
  ): Promise<ExpoPushTicket[]>;
}

export const expoProvider: Provider = {
  provide: EXPO_CLIENT,
  useFactory: (config: ConfigService): ExpoLike =>
    new Expo({ accessToken: config.get<string>('EXPO_ACCESS_TOKEN') }),
  inject: [ConfigService],
};
