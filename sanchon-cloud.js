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
    appId: "1:916476819863:web:9cddd1adaeaa0b90a7acd2",
    // 실시간 데이터베이스 주소 (콘솔의 Realtime Database 화면 맨 위에 나오는 주소)
    databaseURL: "https://sanchondiary-aa415-default-rtdb.asia-southeast1.firebasedatabase.app"
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

  // ---- 실시간 방(친구 마을에서 함께 있기): Firebase 실시간 데이터베이스 ----
  // 게임이 쓰는 room 창구(join → presence/onPeers/leave)를 그대로 흉내 냅니다.
  function makeRoomShim(rtdb, uid, TS) {
    let off = 0;
    try { rtdb.ref('.info/serverTimeOffset').on('value', s => { off = s.val() || 0; }); } catch (e) {}
    return {
      join: async name => {
        const key = uid + '_' + Math.random().toString(36).slice(2, 8);
        const base = rtdb.ref('rooms/' + name), me = base.child(key);
        let mine = {}, timer = null, last = 0, dead = false, hs = [], peers = [];
        const flush = () => { timer = null; if (dead) return; last = Date.now(); me.set({ by: uid, p: mine, t: TS }).catch(() => {}); };
        try { me.onDisconnect().remove(); } catch (e) {}
        const hb = setInterval(() => { if (!dead) me.child('t').set(TS).catch(() => {}); }, 20000);
        const onVal = snap => {
          const v = snap.val() || {}, now = Date.now() + off;
          peers = Object.entries(v).filter(([k, e]) => e && e.by && (!e.t || now - e.t < 70000))
            .map(([k, e]) => Object.freeze({ peer: k, by: String(e.by), isMe: e.by === uid, sameTab: k === key, kind: 'viewer', guest: false, presence: e.p || {}, updatedAt: Date.now() }));
          hs.forEach(h => { try { h({ peers, joined: [], left: [], updated: [] }); } catch (e) {} });
        };
        base.on('value', onVal, () => {});
        return {
          name,
          presence: async patch => {
            for (const k in patch) { if (patch[k] === null || patch[k] === undefined) delete mine[k]; else mine[k] = patch[k]; }
            if (!timer) timer = setTimeout(flush, Math.max(0, 150 - (Date.now() - last)));
          },
          peers: () => peers,
          onPeers: h => { hs.push(h); setTimeout(() => h({ peers, joined: peers, left: [], updated: [] }), 0); return () => { hs = hs.filter(x => x !== h); }; },
          emit: async () => {}, on: () => () => {}, connected: () => true, onConnection: () => () => {},
          leave: async () => { if (dead) return; dead = true; clearInterval(hb); clearTimeout(timer); base.off('value', onVal); try { me.onDisconnect().cancel(); } catch (e) {} await me.remove().catch(() => {}); }
        };
      }
    };
  }
  let rtdb = null; const ROOMS = {};
  try { if (firebase.database) rtdb = firebase.database(); } catch (e) {}

  window.SCFB = {
    ver: 'v19',
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
      p.setCustomParameters({ prompt: 'select_account' }); // 매번 계정 고르는 창 띄우기
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
      if (name === 'room') return rtdb ? (ROOMS[u.uid] = ROOMS[u.uid] || makeRoomShim(rtdb, u.uid, firebase.database.ServerValue.TIMESTAMP)) : null;
      return null;
    }
  };
})();
