import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    console.error('Firebase admin initialization error:', error);
  }
}

export async function verifyBearer(authorization?: string) {
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  const idToken = authorization.slice(7);

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

export async function verifyAuth(req: Request): Promise<admin.auth.DecodedIdToken | null> {
  const authorization = req.headers.get('authorization');
  return verifyBearer(authorization || undefined);
}
