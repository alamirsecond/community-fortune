
import pool from "../../database.js";
import pool from "../../database.js";

export const DEFAULT_ACCOUNT_SETTINGS = {
  emailNotifications: {
    notifyInstantWins: true,
    notifyNewCompetitions: true,
    notifyWins: true,
    notifyWithdrawals: true,
    newsletter: true
  },
  privacySettings: {
    showMyWinsPublicly: true,
    showMyProfilePublicly: true,
    showMyActivityPublicly: false
  }
};

const NOTIFICATION_KEY_MAP = {
  instant_win: "notifyInstantWins",
  new_competitions: "notifyNewCompetitions",
  wins: "notifyWins",
  withdrawals: "notifyWithdrawals",
  newsletter: "newsletter",
  winner_notification: "notifyWins",
  withdrawal_notification: "notifyWithdrawals",
  marketing_emails: "newsletter",
  competition_entry_confirmation: "notifyNewCompetitions"
};

export const getUserAccountSettings = async (userId, connection = pool) => {
  const [rows] = await connection.query(
    `SELECT
      notify_instant_wins,
      notify_new_competitions,
      notify_wins,
      notify_withdrawals,
      newsletter,
      show_my_wins_publicly,
      show_my_profile_publicly,
      show_my_activity_publicly
     FROM user_account_settings
     WHERE user_id = UUID_TO_BIN(?)`,
    [userId]
  );

  if (!rows.length) {
    return DEFAULT_ACCOUNT_SETTINGS;
  }

  const row = rows[0];

  return {
    emailNotifications: {
      notifyInstantWins: !!row.notify_instant_wins,
      notifyNewCompetitions: !!row.notify_new_competitions,
      notifyWins: !!row.notify_wins,
      notifyWithdrawals: !!row.notify_withdrawals,
      newsletter: !!row.newsletter
    },
    privacySettings: {
      showMyWinsPublicly: !!row.show_my_wins_publicly,
      showMyProfilePublicly: !!row.show_my_profile_publicly,
      showMyActivityPublicly: !!row.show_my_activity_publicly
    }
  };
};

export const saveUserAccountSettings = async (userId, settings, connection = pool) => {
  await connection.query(
    `INSERT INTO user_account_settings (
      user_id,
      notify_instant_wins,
      notify_new_competitions,
      notify_wins,
      notify_withdrawals,
      newsletter,
      show_my_wins_publicly,
      show_my_profile_publicly,
      show_my_activity_publicly
     ) VALUES (
      UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?, ?
     )
     ON DUPLICATE KEY UPDATE
      notify_instant_wins = VALUES(notify_instant_wins),
      notify_new_competitions = VALUES(notify_new_competitions),
      notify_wins = VALUES(notify_wins),
      notify_withdrawals = VALUES(notify_withdrawals),
      newsletter = VALUES(newsletter),
      show_my_wins_publicly = VALUES(show_my_wins_publicly),
      show_my_profile_publicly = VALUES(show_my_profile_publicly),
      show_my_activity_publicly = VALUES(show_my_activity_publicly),
      updated_at = CURRENT_TIMESTAMP`,
    [
      userId,
      settings.emailNotifications.notifyInstantWins,
      settings.emailNotifications.notifyNewCompetitions,
      settings.emailNotifications.notifyWins,
      settings.emailNotifications.notifyWithdrawals,
      settings.emailNotifications.newsletter,
      settings.privacySettings.showMyWinsPublicly,
      settings.privacySettings.showMyProfilePublicly,
      settings.privacySettings.showMyActivityPublicly
    ]
  );
};

export const isUserNotificationEnabled = async (userId, key, connection = pool) => {
  if (!userId || !key) {
    return true;
  }

  const mappedKey = NOTIFICATION_KEY_MAP[key];
  if (!mappedKey) {
    return true;
  }

  const settings = await getUserAccountSettings(userId, connection);
  return !!settings.emailNotifications[mappedKey];
};
