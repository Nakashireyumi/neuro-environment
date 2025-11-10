# cvm.py
import json
import os
import subprocess
import threading
import uuid
from typing import Any, Dict, List, Optional

DELIM = "\n\n"

class CVMConfig:
    def __init__(
        self,
        node_path: str = "node",
        bridge_js: str = "dist/bridge.js",
        cwd: Optional[str] = None,
        env: Optional[Dict[str, str]] = None,
    ):
        self.node_path = node_path
        self.bridge_js = bridge_js
        self.cwd = cwd
        self.env = env or os.environ.copy()


class CVM:
    """
    Cassitly VM bridge: manages a Node subprocess and JSON-RPC communication.
    It does not know about VirtualFS or any specific API.
    """

    def __init__(self, config: CVMConfig):
        self.config = config
        self.proc = subprocess.Popen(
            [self.config.node_path, self.config.bridge_js],
            cwd=self.config.cwd,
            env=self.config.env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        self._lock = threading.Lock()
        self._responses: Dict[str, Dict[str, Any]] = {}
        self._reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
        self._reader_thread.start()

    def close(self):
        if self.proc and self.proc.poll() is None:
            try:
                self.proc.stdin.close()
                self.proc.terminate()
            except Exception:
                pass

    def _reader_loop(self):
        buf = ""
        while True:
            if self.proc.stdout is None:
                break
            chunk = self.proc.stdout.read(1)
            if not chunk:
                break
            buf += chunk
            while True:
                idx = buf.find(DELIM)
                if idx == -1:
                    break
                raw = buf[:idx]
                buf = buf[idx + len(DELIM):]
                try:
                    msg = json.loads(raw)
                except Exception:
                    continue
                msg_id = str(msg.get("id"))
                with self._lock:
                    self._responses[msg_id] = msg

    def call(self, method: str, params: List[Any]) -> Any:
        """
        Generic RPC call into the Node bridge.
        """
        if self.proc.stdin is None:
            raise RuntimeError("Bridge stdin not available")
        msg_id = str(uuid.uuid4())
        payload = {"id": msg_id, "method": method, "params": params}
        self.proc.stdin.write(json.dumps(payload) + DELIM)
        self.proc.stdin.flush()

        # Wait for response
        while True:
            with self._lock:
                if msg_id in self._responses:
                    msg = self._responses.pop(msg_id)
                    break
        if "error" in msg and msg["error"]:
            raise RuntimeError(msg["error"].get("message", "Unknown error"))
        return msg.get("result")
