import { useRef, useState } from 'react';
// import firebase from 'firebase/app';
// import 'firebase/firestore';
import { initializeApp } from "firebase/app";
import { getFirestore, collection } from "firebase/firestore/lite";

import { ReactComponent as HangupIcon } from './icons/hangup.svg';
import { ReactComponent as MoreIcon } from './icons/dots.svg';
import { ReactComponent as CopyIcon } from './icons/copy.svg';

import './App.css';

// Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAuHcVzheRaOw3DWNGxnNHxX32gkKa0x_M",
  authDomain: "video-chat-app-dbafd.firebaseapp.com",
  projectId: "video-chat-app-dbafd",
  storageBucket: "video-chat-app-dbafd.appspot.com",
  messagingSenderId: "833409976929",
  appId: "1:833409976929:web:cb232088af5d5d131eb820"
};

let app;

app = initializeApp(firebaseConfig);


const db = getFirestore(app);

// Initialize WebRTC
const servers = {
  iceServers: [
    {
      urls: [
        'stun.stun1.1.google.com:19302',
        'stun.stun2.1.google.com:19302',
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

const pc = new RTCPeerConnection(servers);

function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [joinCode, setJoinCode] = useState('');
  return (
    <div className="App">
      {currentPage === 'home' ? (
        <Menu joinCode={joinCode} setJoinCode={setJoinCode} setPage={setCurrentPage} />
      ) : (
        <Videos callId={joinCode} mode={setCurrentPage} setPage={setCurrentPage} />
      )}

    </div>
  );
}

function Menu({ joinCode, setJoinCode, setPage }) {
  return (
    <div className="home">
      <div className="create box">
        <button onClick={() => setPage('create')}>Create Call</button>
      </div>
      <div className="answer box">
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          placeholder="Join with code"
        />
        <button onClick={() => setPage('join')}>Join Call</button>
      </div>
    </div>
  )
}

function Videos({ callId, mode, setPage }) {
  const [webcamActive, setWebcamActive] = useState(false);
  const [roomId, setRoomId] = useState(callId);

  const localRef = useRef();
  const remoteRef = useRef();

  const setupSources = async () => {
    const localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    const remoteStream = new MediaStream();

    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
    };

    localRef.current.srcObject = localStream;
    remoteRef.current.srcObject = remoteStream;

    setWebcamActive(true);

    if (mode === 'create') {
      const callDoc = await collection(db, 'calls').doc();
      const offerCandidates = callDoc.collection('offerCandidates');
      const answerCandidates = callDoc.collection('answerCandidates');

      setRoomId(callDoc.id);

      pc.onicecandidate = (event) => {
        event.candidate &&
          offerCandidates.add(event.candidate.toJSON());
      };

      const offerDescription = await pc.createOffer();
      await pc.setLocalDescription(offerDescription);

      const offer = {
        sdp: offerDescription.sdp,
        type: offerDescription.type,
      };

      await callDoc.set({ offer });

      callDoc.onSnapshot((snapshot) => {
        const data = snapshot.data();
        if (!pc.currentRemoteDescription && data?.answer) {
          const answerDescription = new RTCSessionDescription(data.answer);
          pc.setRemoteDescription(answerDescription);
        }
      });

      answerCandidates.onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const candidate = new RTCIceCandidate(change.doc.data());
            pc.addIceCandidate(candidate);
          }
        });
      });
    } else if (mode === 'join') {
      const callDoc = await collection(db, 'calls').doc(callId);
      const answerCandidates = callDoc.collection('answerCandidates');
      const offerCandidates = callDoc.collection('offerCandidates');

      pc.onicecandidate = (event) => {
        event.candidate &&
          answerCandidates.add(event.candidate.toJSON());
      }

      const callData = (await callDoc.get()).data();

      const offerDescription = callData.offer;
      await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

      const answerDescription = await pc.createAnswer();
      await pc.setLocalDescription(answerDescription);

      const answer = {
        type: answerDescription.type,
        sdp: answerDescription.sdp,
      };

      await callDoc.update({ answer });

      offerCandidates.onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const candidate = new RTCIceCandidate(change.doc.data());
            pc.addIceCandidate(candidate);
          }
        });
      });
    }

    pc.onconnectionstatechange = (event) => {
      if (pc.connectionState === 'disconnected') {
        hangup();
      }
    }
  };

  const hangup = async () => {
    // first close the peer connection
    pc.close();

    if (roomId) {
      let roomRef = collection(db, 'calls').doc(roomId);
      await roomRef
        .collection('answerCandidates')
        .get()
        .then((querySnapshot) => {
          querySnapshot.forEach((doc) => {
            doc.ref.delete();
          });
        });
      await roomRef
        .collection('offerCandidates')
        .get()
        .then((querySnapshot) => {
          querySnapshot.forEach((doc) => {
            doc.ref.delete();
          });
        });
      await roomRef.delete();
    }

    window.location.reload();
  };

  return (
    <div className="videos">
      <video
        ref={localRef}
        autoPlay
        playsInline
        muted
        className="local"
      />
      <video
        ref={remoteRef}
        autoPlay
        playsInline
        className="remote"
      />

      <div className="buttonsContainer">
        <button
          onClick={hangup}
          disabled={!webcamActive}
          className="hangup button"
        >
          <HangupIcon />
        </button>
        <div tabIndex={0} role="button" className="more button">
          <MoreIcon />
          <div className="popover">
            <button
              onClick={() => {
                navigator.clipboard.writeText(roomId);
              }}
            >
              <CopyIcon /> Copy joining code
            </button>
          </div>
        </div>
      </div>

      {!webcamActive && (
        <div className="modalContainer">
          <div className="modal">
            <h3>Please allow webcam and microphone access</h3>
            <div className="container">
              <button onClick={() => setPage('home')} className="secondary">Cancel</button>
              <button onClick={setupSources}>Start</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App;
