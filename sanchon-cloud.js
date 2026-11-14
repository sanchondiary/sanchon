// 산촌일기 ↔ Firebase 연결
// 게임이 쓰는 저장 창구(window.claude.use('db'/'user'))를 Firebase로 이어 줍니다.
(function () {
  if (!window.firebase) return; // 라이브러리를 못 읽으면 기기 저장만으로 실행
  const firebaseConfig = {
    apiKey: "AIzaSyAGA-EcwMeeYy3WRbaWAYD-bG2FOmxF5IE",
    authDomain: "sanchondiary-aa415.firebaseapp.com",
    projectId: "sanchondiary-aa415",
    storageBucket: "sanchondiary-aa415.firebasestorage.app",
    messagingSenderId: "916476819863",
    appId: "1:916476819863:web:9cddd1adaeaa0b90a7acd2"
  };
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth(), fs = firebase.firestore();
  // 게임 자료에 빈 값(undefined)이 섞여 있어도 저장이 막히지 않게
  try { fs.settings({ ignoreUndefinedProperties: true }); } catch (e) {}

  // 처음엔 이름 없는(익명) 계정으로 자동 접속 → 나중에 구글 계정으로 올릴 수 있음
  const ready = new Promise(res => {
    let done = false;
    const fin = u => { if (!done) { done = true; res(u); } };
    auth.onAuthStateChanged(u => {
      if (u) fin(u);
      else auth.signInAnonymously().catch(() => fin(null));
    });
    setTimeout(() => fin(auth.currentUser || null), 8000); // 인터넷이 없으면 기다리지 않음
  });

  // 게임의 저장 경로 'data/users/<id>/save' → Firestore 'saves/<id>'
  const map = p => { const m = /^data\/users\/([^/]+)\/save$/.exec(p); return m ? 'saves/' + m[1] : p; };
  // 저장 성공·실패를 기록해 두어 게임 화면에서 연결 상태를 보여 줌
  const LOG = { ok: {}, err: '' };
  const wrapDoc = p => {
    const ref = fs.doc(map(p));
    return {
      id: ref.id,
      get: () => ref.get(),
      set: v => {
        try {
          return ref.set(v).then(r => { LOG.ok[p.split('/')[0]] = Date.now(); LOG.err = ''; return r; },
            e => { LOG.err = (e && (e.code || e.message)) || '알 수 없는 오류'; throw e; });
        } catch (e) { LOG.err = (e && e.message) || '알 수 없는 오류'; return Promise.reject(e); }
      }
    };
  };
  const db = { doc: wrapDoc, collection: n => fs.collection(n) };

  window.SCFB = {
    auth, fs, ready,
    isGoogle: () => !!(auth.currentUser && !auth.currentUser.isAnonymous),
    who() {
      const u = auth.currentUser;
      if (!u) return '지금은 서버에 연결되지 않았어요. 인터넷이 되면 다시 열어 주세요.';
      if (u.isAnonymous) return '지금 마을은 이 기기에만 묶여 있어요. 구글로 로그인해 두면 휴대폰을 바꾸거나 앱을 지워도 같은 계정으로 이어서 할 수 있어요.';
      return `구글 계정 <b>${(u.email || '').replace(/[<>&"]/g, '')}</b>에 연결되어 있어요. 다른 기기에서도 이 계정으로 로그인하면 이어서 할 수 있어요.`;
    },
    async google() {
      const p = new firebase.auth.GoogleAuthProvider();
      const u = auth.currentUser;
      try {
        if (u && u.isAnonymous) { await u.linkWithPopup(p); return { linked: true }; }
        await auth.signInWithPopup(p); return { switched: true };
      } catch (e) {
        if (e && e.code === 'auth/credential-already-in-use' && e.credential) {
          await auth.signInWithCredential(e.credential); return { switched: true };
        }
        throw e;
      }
    },
    status() {
      const u = auth.currentUser, t = LOG.ok.villages, tm = x => new Date(x).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      if (!u) return '<span style="color:#b8372b">서버 연결 안 됨 · 인터넷 연결을 확인해 주세요.</span>';
      if (LOG.err) return `<span style="color:#b8372b">서버 저장 오류 · ${String(LOG.err).replace(/[<>&]/g, '').slice(0, 80)}</span>`;
      if (t) return `<span style="color:#4f8a3a">✓ 서버 연결됨 · 내 마을 등록 ${tm(t)}</span>`;
      return '서버 연결됨 · 내 마을을 올리는 중이에요 (몇 초 걸려요)';
    },
    async loadSave() {
      const u = auth.currentUser; if (!u) return null;
      const s = await fs.doc('saves/' + u.uid).get();
      return s.exists ? JSON.parse(s.data().json) : null;
    }
  };

  window.claude = {
    use: async name => {
      const u = await ready; if (!u) return null;
      if (name === 'db') return db;
      if (name === 'user') return { id: async () => u.uid };
      return null;
    }
  };
})();
