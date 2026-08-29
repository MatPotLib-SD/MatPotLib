import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { ALERT_COOLDOWN_SECONDS } from '../common/constants';
import { SupabaseService } from '../common/supabase.service';
import type { AlertRow } from '../common/database.types';
import { EXPO_CLIENT } from './expo.provider';
import type { ExpoLike } from './expo.provider';

/** Metric values from a reading that alert evaluation cares about. */
export interface ReadingMetrics {
  moisture: number | null;
  temp_c: number | null;
  humidity: number | null;
  lux: number | null;
}

type MetricName = 'moisture' | 'temp' | 'humidity' | 'lux';
type Direction = 'low' | 'high';

const METRIC_LABELS: Record<MetricName, string> = {
  moisture: 'Soil moisture',
  temp: 'Temperature',
  humidity: 'Humidity',
  lux: 'Light level',
};

const METRIC_UNITS: Record<MetricName, string> = {
  moisture: '%',
  temp: '°C',
  humidity: '%',
  lux: ' lux',
};

const BEGINNER_TIPS: Record<`${MetricName}_${Direction}`, string> = {
  moisture_low:
    'Dry soil stresses the roots — give your plant a thorough watering soon.',
  moisture_high:
    'Soggy soil can cause root rot — hold off on watering and check that the pot drains.',
  temp_low:
    'Cold air can damage leaves — move your plant somewhere warmer, away from drafts.',
  temp_high:
    'Heat dries plants out quickly — move it away from direct sun or heat sources.',
  humidity_low:
    'Dry air can brown the leaf tips — try misting or placing a tray of water nearby.',
  humidity_high:
    'Very humid air encourages mold — improve the airflow around your plant.',
  lux_low:
    'Without enough light growth slows down — move your plant closer to a bright window.',
  lux_high:
    'Too much light can scorch the leaves — move your plant out of direct sun.',
};

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    @Inject(EXPO_CLIENT) private readonly expo: ExpoLike,
  ) {}

  /** Alert history for a user, newest first. */
  async list(userId: string): Promise<AlertRow[]> {
    const { data, error } = await this.supabase.admin
      .from('alerts')
      .select('*')
      .eq('user_id', userId)
      .order('ts', { ascending: false })
      .limit(200);
    if (error) throw new InternalServerErrorException(error.message);
    return data ?? [];
  }

  /**
   * Evaluates a reading against the species ideal ranges of the plant linked
   * to the device (handoff §8.3). Never throws — ingest must not fail
   * because alerting did.
   */
  async evaluate(deviceId: string, reading: ReadingMetrics): Promise<void> {
    try {
      await this.evaluateInternal(deviceId, reading);
    } catch (err) {
      this.logger.error(
        `Alert evaluation failed for device ${deviceId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private async evaluateInternal(
    deviceId: string,
    reading: ReadingMetrics,
  ): Promise<void> {
    const db = this.supabase.admin;

    // Resolve the pot's CURRENT owner first. Matching user_plants on device_id
    // alone can pick up a previous owner's stale row and deliver this reading's
    // alert to their phone instead of the person who actually owns the pot.
    const { data: device } = await db
      .from('devices')
      .select('*')
      .eq('id', deviceId)
      .maybeSingle();
    if (!device?.owner_user_id) return; // unclaimed pot → nobody to alert

    const { data: plants } = await db
      .from('user_plants')
      .select('*')
      .eq('device_id', deviceId)
      .eq('owner_user_id', device.owner_user_id)
      .limit(1);
    const plant = plants?.[0];
    if (!plant || !plant.plant_species_id) return; // no plant → skip

    const { data: species } = await db
      .from('plant_species')
      .select('*')
      .eq('id', plant.plant_species_id)
      .maybeSingle();
    if (!species) return;

    const metrics: {
      metric: MetricName;
      value: number | null;
      min: number | null;
      max: number | null;
    }[] = [
      {
        metric: 'moisture',
        value: reading.moisture,
        min: species.ideal_moisture_min,
        max: species.ideal_moisture_max,
      },
      {
        metric: 'temp',
        value: reading.temp_c,
        min: species.ideal_temp_min,
        max: species.ideal_temp_max,
      },
      {
        metric: 'humidity',
        value: reading.humidity,
        min: species.ideal_humidity_min,
        max: species.ideal_humidity_max,
      },
      {
        metric: 'lux',
        value: reading.lux,
        min: species.ideal_lux_min,
        max: species.ideal_lux_max,
      },
    ];

    const plantName = plant.nickname ?? 'Your plant';
    let verbose: boolean | null = null;
    const isVerbose = async (): Promise<boolean> => {
      if (verbose === null) {
        const { data: profile } = await db
          .from('profiles')
          .select('*')
          .eq('user_id', plant.owner_user_id)
          .maybeSingle();
        verbose = profile?.experience_level === 'beginner';
      }
      return verbose;
    };

    for (const { metric, value, min, max } of metrics) {
      if (value == null || min == null || max == null) continue;
      const cooldownKey = `${plant.id}:${metric}`;
      const breachTypes = [`${metric}_low`, `${metric}_high`];

      if (value >= min && value <= max) {
        // In range: resolve any active alert and emit one recovered alert.
        const { data: active } = await db
          .from('alerts')
          .select('*')
          .eq('cooldown_key', cooldownKey)
          .eq('status', 'active')
          .in('type', breachTypes)
          .limit(1);
        if (!active || active.length === 0) continue;

        await db
          .from('alerts')
          .update({ status: 'resolved' })
          .eq('cooldown_key', cooldownKey)
          .eq('status', 'active')
          .in('type', breachTypes);

        const message = this.buildRecoveredMessage(
          metric,
          value,
          plantName,
          await isVerbose(),
        );
        await db.from('alerts').insert({
          user_id: plant.owner_user_id,
          device_id: deviceId,
          user_plant_id: plant.id,
          type: `${metric}_recovered`,
          severity: 'info',
          message,
          status: 'resolved',
          cooldown_key: cooldownKey,
        });
        await this.push(plant.owner_user_id, `${plantName} recovered`, message);
        continue;
      }

      // Out of range: honor the universal cooldown per cooldown_key.
      const cutoff = new Date(
        Date.now() - ALERT_COOLDOWN_SECONDS * 1000,
      ).toISOString();
      const { data: recent } = await db
        .from('alerts')
        .select('*')
        .eq('cooldown_key', cooldownKey)
        .in('type', breachTypes)
        .gte('ts', cutoff)
        .limit(1);
      if (recent && recent.length > 0) continue;

      const direction: Direction = value < min ? 'low' : 'high';
      const severity =
        metric === 'moisture' && direction === 'low' ? 'high' : 'medium';
      const message = this.buildAlertMessage(
        metric,
        direction,
        value,
        min,
        max,
        plantName,
        await isVerbose(),
      );
      await db.from('alerts').insert({
        user_id: plant.owner_user_id,
        device_id: deviceId,
        user_plant_id: plant.id,
        type: `${metric}_${direction}`,
        severity,
        message,
        status: 'active',
        cooldown_key: cooldownKey,
      });
      await this.push(
        plant.owner_user_id,
        `${plantName} needs attention`,
        message,
      );
    }
  }

  private buildAlertMessage(
    metric: MetricName,
    direction: Direction,
    value: number,
    min: number,
    max: number,
    plantName: string,
    verbose: boolean,
  ): string {
    const label = METRIC_LABELS[metric];
    const unit = METRIC_UNITS[metric];
    if (!verbose) {
      return `${label} ${direction}: ${value}${unit} (ideal ${min}–${max}${unit}).`;
    }
    const comparison = direction === 'low' ? 'below' : 'above';
    return (
      `${plantName}: ${label.toLowerCase()} is ${value}${unit}, ${comparison} ` +
      `the ideal range of ${min}–${max}${unit}. ` +
      BEGINNER_TIPS[`${metric}_${direction}`]
    );
  }

  private buildRecoveredMessage(
    metric: MetricName,
    value: number,
    plantName: string,
    verbose: boolean,
  ): string {
    const label = METRIC_LABELS[metric];
    const unit = METRIC_UNITS[metric];
    if (!verbose) {
      return `${label} back in range: ${value}${unit}.`;
    }
    return (
      `Good news — ${plantName}'s ${label.toLowerCase()} is back in the ` +
      `ideal range at ${value}${unit}. No action needed.`
    );
  }

  /** Sends a push to every registered token of the user, pruning dead ones. */
  private async push(
    userId: string,
    title: string,
    body: string,
  ): Promise<void> {
    try {
      const db = this.supabase.admin;
      const { data: tokens } = await db
        .from('push_tokens')
        .select('*')
        .eq('user_id', userId);
      const valid = (tokens ?? []).filter((t) =>
        Expo.isExpoPushToken(t.expo_token),
      );
      if (valid.length === 0) return;

      const messages: ExpoPushMessage[] = valid.map((t) => ({
        to: t.expo_token,
        sound: 'default',
        title,
        body,
      }));

      for (const chunk of this.expo.chunkPushNotifications(messages)) {
        let tickets: ExpoPushTicket[];
        try {
          tickets = await this.expo.sendPushNotificationsAsync(chunk);
        } catch (err) {
          this.logger.warn(
            `Expo push failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          continue;
        }
        for (let i = 0; i < tickets.length; i++) {
          const ticket = tickets[i];
          if (ticket.status !== 'error') continue;
          this.logger.warn(`Expo push ticket error: ${ticket.message}`);
          if (ticket.details?.error === 'DeviceNotRegistered') {
            const to = chunk[i]?.to;
            if (typeof to === 'string') {
              await db.from('push_tokens').delete().eq('expo_token', to);
            }
          }
        }
      }
    } catch (err) {
      this.logger.warn(
        `Push delivery failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
