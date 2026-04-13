import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as jwt from "jsonwebtoken";
import jwksRsa = require("jwks-rsa");

admin.initializeApp();

// JWKS client to fetch Microsoft's public keys
const jwksClient = jwksRsa({
  jwksUri: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
  cache: true,
  rateLimit: true,
});

// Helper to get the signing key from Microsoft
function getSigningKey(kid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    jwksClient.getSigningKey(kid, (err: any, key: any) => {
      if (err) return reject(err);
      const signingKey = key?.getPublicKey();
      if (!signingKey) return reject(new Error("No signing key found"));
      resolve(signingKey);
    });
  });
}

// Cloud Function 1: exchanges a Microsoft token for a Firebase custom token
export const getMicrosoftFirebaseToken = onCall(
  async (request) => {
    const microsoftToken = request.data?.microsoftToken;
    if (!microsoftToken) {
      throw new HttpsError(
        "invalid-argument",
        "Microsoft token is required"
      );
    }
    try {
      const decoded = jwt.decode(microsoftToken, { complete: true });
      if (!decoded || typeof decoded === "string") {
        throw new Error("Invalid token format");
      }
      const kid = decoded.header.kid;
      if (!kid) throw new Error("No kid in token header");
      const publicKey = await getSigningKey(kid);
      const payload = jwt.verify(microsoftToken, publicKey, {
        algorithms: ["RS256"],
      }) as jwt.JwtPayload;
      const email =
        payload.preferred_username || payload.email || payload.upn;
      if (!email) throw new Error("No email found in token");
      const uid = email.toLowerCase().replace(/[^a-z0-9]/g, "_");
      const firebaseToken = await admin.auth().createCustomToken(uid, {
        email: email.toLowerCase(),
      });
      return { firebaseToken, email: email.toLowerCase() };
    } catch (err: any) {
      console.error("Token exchange error:", err);
      throw new HttpsError(
        "unauthenticated",
        "Failed to verify Microsoft token: " + err.message
      );
    }
  }
);

// Cloud Function 2: watches queue changes and sends FCM push notifications
export const onQueueUpdate = onDocumentWritten(
  "stores/{storeId}/regions/{region}",
  async (event) => {
    const after = event.data?.after.data();
    if (!after) return;

    const queue: any[] = after.queue ?? [];
    const before = event.data?.before.data();
    const beforeQueue: any[] = before?.queue ?? [];

    // Check positions 1-4 for users with push tokens
    const notifyPositions = [1, 2, 3, 4];

    for (let i = 0; i < Math.min(queue.length, 4); i++) {
      const entry = queue[i];
      const position = i + 1;

      if (!notifyPositions.includes(position)) continue;
      if (!entry.email) continue;

      // Only notify if position changed
      const prevIndex = beforeQueue.findIndex(
        (e: any) => e.email?.toLowerCase() === entry.email?.toLowerCase()
      );
      const prevPosition = prevIndex !== -1 ? prevIndex + 1 : null;
      if (prevPosition === position) continue;

      // Look up the user's push token
      const uid = entry.email.toLowerCase().replace(/[^a-z0-9]/g, "_");
      const userDoc = await admin.firestore().collection("users").doc(uid).get();

      if (!userDoc.exists) continue;

      const pushToken = userDoc.data()?.pushToken;
      if (!pushToken) continue;

      // Build the notification message
      const body =
        position === 1
          ? "You're up next! 🚗"
          : `You're now #${position} in the queue.`;

      try {
        await admin.messaging().send({
          token: pushToken,
          notification: {
            title: "ON-DECK",
            body,
          },
          android: {
            notification: {
              channelId: "queue-alerts",
              sound: "default",
              priority: "high",
              vibrateTimingsMillis: [0, 250, 250, 250],
              defaultVibrateTimings: false,
            },
          },
          apns: {
            payload: {
              aps: {
                sound: "default",
                badge: 1,
                contentAvailable: true,
              },
            },
            headers: {
              "apns-priority": "10",
              "apns-push-type": "alert",
            },
          },
        });
        console.log(`Notification sent to ${entry.email} at position ${position}`);
      } catch (err) {
        console.error(`Failed to send notification to ${entry.email}:`, err);
      }
    }
  }
);

// Cloud Function 3: verifies admin PIN server-side
export const verifyAdminPin = onCall(
  { secrets: ["ADMIN_PIN"] },
  async (request) => {
    const { pin } = request.data;
    if (!pin) {
      throw new HttpsError("invalid-argument", "PIN is required");
    }
    const correctPin = process.env.ADMIN_PIN;
    if (!correctPin) {
      throw new HttpsError("internal", "PIN not configured");
    }
    if (pin.trim() !== correctPin.trim()) {
      throw new HttpsError("unauthenticated", "Incorrect PIN");
    }
    return { success: true };
  }
);