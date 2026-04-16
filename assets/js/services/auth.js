import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

import { auth, db } from './firebase-config.js';
import {
  ensurePermissionsByRole,
  canEditTargetUser,
  canInactivateTargetUser,
  canAssignAccessLevel,
  isAdmin
} from './utils.js';

const usersRef = collection(db, 'users');

async function getUserProfile(uid) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return null;
  }

  return {
    id: snap.id,
    uid: snap.id,
    ...snap.data()
  };
}

async function getUserById(userId) {
  const ref = doc(db, 'users', userId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error('Usuário não encontrado.');
  }

  return {
    id: snap.id,
    uid: snap.id,
    ...snap.data()
  };
}

export async function login(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const profile = await getUserProfile(credential.user.uid);

  if (!profile) {
    await signOut(auth);
    throw new Error('Usuário sem cadastro interno.');
  }

  if (profile.deleted === true || profile.active === false) {
    await signOut(auth);
    throw new Error('Usuário inativo. Acesso bloqueado.');
  }

  return {
    user: credential.user,
    profile
  };
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null);
      return;
    }

    const profile = await getUserProfile(user.uid);

    if (!profile || profile.deleted === true || profile.active === false) {
      await signOut(auth);
      callback(null);
      return;
    }

    callback({
      ...profile,
      uid: user.uid,
      email: user.email
    });
  });
}

export async function logout() {
  await signOut(auth);
}

function normalizeUserPayload(payload, actor) {
  const role = payload.role || 'Vendedor';
  const accessLevel = payload.accessLevel || 'standard';

  if (!canAssignAccessLevel(actor, accessLevel)) {
    throw new Error('Você não pode atribuir este nível de acesso.');
  }

  const permissions = Array.isArray(payload.permissions) && payload.permissions.length
    ? payload.permissions
    : ensurePermissionsByRole(role, accessLevel);

  return {
    fullName: String(payload.fullName || '').trim(),
    username: String(payload.username || '').trim(),
    email: String(payload.email || payload.username || '').trim(),
    role,
    accessLevel,
    permissions,
    active: payload.active !== false,
    deleted: false
  };
}

export async function createManagedUser(currentUser, payload) {
  if (!isAdmin(currentUser)) {
    throw new Error('Sem permissão para criar usuários.');
  }

  const password = String(payload.password || '').trim();
  if (!password) {
    throw new Error('Senha obrigatória.');
  }

  const data = normalizeUserPayload(payload, currentUser);
  const credential = await createUserWithEmailAndPassword(auth, data.email, password);

  await setDoc(doc(db, 'users', credential.user.uid), {
    fullName: data.fullName,
    username: data.username,
    email: data.email,
    role: data.role,
    accessLevel: data.accessLevel,
    permissions: data.permissions,
    active: data.active,
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return {
    id: credential.user.uid,
    uid: credential.user.uid,
    ...data
  };
}

export async function updateManagedUser(currentUser, targetUserId, payload) {
  if (!isAdmin(currentUser)) {
    throw new Error('Sem permissão para editar usuários.');
  }

  const targetUser = await getUserById(targetUserId);

  if (!canEditTargetUser(currentUser, targetUser)) {
    throw new Error('Você não pode editar este usuário.');
  }

  const data = normalizeUserPayload(payload, currentUser);

  await updateDoc(doc(db, 'users', targetUserId), {
    fullName: data.fullName,
    username: data.username,
    email: data.email,
    role: data.role,
    accessLevel: data.accessLevel,
    permissions: data.permissions,
    active: data.active,
    updatedAt: serverTimestamp()
  });

  return {
    id: targetUserId,
    uid: targetUserId,
    ...data
  };
}

export async function deleteManagedUser(currentUser, targetUserId) {
  if (!isAdmin(currentUser)) {
    throw new Error('Sem permissão para inativar usuários.');
  }

  const targetUser = await getUserById(targetUserId);

  if (!canInactivateTargetUser(currentUser, targetUser)) {
    throw new Error('Você não pode inativar este usuário.');
  }

  await updateDoc(doc(db, 'users', targetUserId), {
    active: false,
    deleted: true,
    updatedAt: serverTimestamp()
  });

  return true;
}

export async function listUsers() {
  const snap = await getDocs(usersRef);

  return snap.docs
    .map((row) => ({
      id: row.id,
      uid: row.id,
      ...row.data()
    }))
    .sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
}

export async function changeCurrentPassword(currentPassword, newPassword) {
  const user = auth.currentUser;

  if (!user?.email) {
    throw new Error('Usuário não autenticado.');
  }

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

export async function findUserByUsername(username) {
  const q = query(usersRef, where('username', '==', username));
  const snap = await getDocs(q);

  if (snap.empty) {
    return null;
  }

  const docSnap = snap.docs[0];

  return {
    id: docSnap.id,
    uid: docSnap.id,
    ...docSnap.data()
  };
}