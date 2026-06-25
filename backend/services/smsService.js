const db = require("../config/db");

// Helper to execute query with promise
const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
};

/**
 * Sends a real SMS via configured SMS providers (Twilio, MSG91, Fast2SMS)
 * and logs the record in the notifications table.
 * 
 * @param {string} smsType - Type of SMS ('sms_sale', 'sms_low_stock', 'sms_out_of_stock')
 * @param {string} message - Message content
 * @param {object} [overrideSettings] - Optional settings map to use instead of querying database (useful for testing)
 */
const sendSMS = async (smsType, message, overrideSettings = null) => {
  try {
    let settings = {};
    if (overrideSettings) {
      settings = overrideSettings;
    } else {
      // 1. Fetch settings from DB
      const results = await query(
        "SELECT * FROM settings WHERE setting_key IN ('owner_mobile', 'sms_enabled', 'sms_provider', 'sms_api_key', 'sms_sender_id', 'sms_twilio_sid')"
      );
      results.forEach(row => {
        settings[row.setting_key] = row.setting_value;
      });
    }

    const isEnabled = settings['sms_enabled'] === 'true' || settings['sms_enabled'] === '1' || overrideSettings !== null;
    const recipient = settings['owner_mobile'];
    const provider = settings['sms_provider'] || 'twilio';
    const apiKey = settings['sms_api_key'];
    const senderId = settings['sms_sender_id'];
    const twilioSid = settings['sms_twilio_sid'];

    if (!isEnabled) {
      console.log(`[SMS Service] SMS notifications are disabled in settings.`);
      return { success: true, disabled: true };
    }

    if (!recipient || recipient.trim() === "") {
      console.log(`[SMS Service] Shop Owner Mobile Number is not configured.`);
      return { success: false, error: "Shop Owner Mobile Number not configured." };
    }

    // Validation: If no SMS provider API key is configured, do not silently fail.
    if (!apiKey || apiKey.trim() === "") {
      const errorMsg = "SMS provider not configured.";
      await query(
        "INSERT INTO notifications (type, message, recipient, status) VALUES (?, ?, ?, 'Failed')",
        [smsType, `Error: ${errorMsg}\n\n${message}`, recipient]
      );
      return { success: false, error: errorMsg };
    }

    console.log(`[SMS Service] Attempting delivery via ${provider} to ${recipient}...`);

    let responseStatus = 200;
    let responseText = "";
    let success = false;

    if (provider === "twilio") {
      if (!twilioSid || twilioSid.trim() === "") {
        throw new Error("Twilio Account SID is not configured.");
      }
      if (!senderId || senderId.trim() === "") {
        throw new Error("Twilio Sender phone number is not configured.");
      }
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
      const basicAuth = Buffer.from(`${twilioSid}:${apiKey}`).toString("base64");
      
      const body = new URLSearchParams({
        To: recipient,
        From: senderId,
        Body: message
      });

      const res = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: body.toString()
      });
      responseStatus = res.status;
      responseText = await res.text();
      success = res.ok;
    } else if (provider === "fast2sms") {
      const fastUrl = "https://www.fast2sms.com/dev/bulkV2";
      const res = await fetch(fastUrl, {
        method: "POST",
        headers: {
          "authorization": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          route: "q",
          message: message,
          numbers: recipient
        })
      });
      responseStatus = res.status;
      responseText = await res.text();
      if (res.ok) {
        try {
          const json = JSON.parse(responseText);
          success = json.return === true;
          if (!success) {
            responseText = json.message || responseText;
          }
        } catch (e) {
          success = true;
        }
      }
    } else if (provider === "msg91") {
      const msgUrl = "https://api.msg91.com/api/v5/flow/";
      const res = await fetch(msgUrl, {
        method: "POST",
        headers: {
          "authkey": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          template_id: senderId,
          recipients: [
            {
              mobiles: recipient,
              message: message
            }
          ]
        })
      });
      responseStatus = res.status;
      responseText = await res.text();
      success = res.ok;
    } else {
      throw new Error(`Unsupported SMS provider: ${provider}`);
    }

    if (success) {
      await query(
        "INSERT INTO notifications (type, message, recipient, status) VALUES (?, ?, ?, 'Sent')",
        [smsType, message, recipient]
      );
      return { success: true };
    } else {
      const errMsg = `Provider responded with status ${responseStatus}: ${responseText}`;
      await query(
        "INSERT INTO notifications (type, message, recipient, status) VALUES (?, ?, ?, 'Failed')",
        [smsType, `Failed: ${errMsg}\n\n${message}`, recipient]
      );
      return { success: false, error: errMsg };
    }
  } catch (err) {
    console.error("[SMS Service] Delivery failed:", err);
    try {
      let recipient = "Unknown";
      if (overrideSettings && overrideSettings.owner_mobile) {
        recipient = overrideSettings.owner_mobile;
      } else {
        const results = await query("SELECT setting_value FROM settings WHERE setting_key = 'owner_mobile'");
        recipient = results.length > 0 ? results[0].setting_value : "Unknown";
      }
      await query(
        "INSERT INTO notifications (type, message, recipient, status) VALUES (?, ?, ?, 'Failed')",
        [smsType, `Error: ${err.message}\n\n${message}`, recipient]
      );
    } catch (logErr) {
      console.error("[SMS Service] Failed to log failure state to database:", logErr);
    }

    return { success: false, error: err.message };
  }
};

module.exports = { sendSMS };
