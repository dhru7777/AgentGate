import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { MONAD_RECEIVE_ADDRESS } from "../modules/chain/monad";

export function ReceiveQr({ onClose }: { onClose: () => void }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancel = false;
    QRCode.toDataURL(MONAD_RECEIVE_ADDRESS, { margin: 1, width: 280, errorCorrectionLevel: "H" })
      .then((url) => {
        if (!cancel) setSrc(url);
      })
      .catch(() => {
        if (!cancel) setSrc("");
      });
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <div className="receive-modal" role="dialog" aria-label="Monad address">
      <div className="receive-sheet">
        <header>
          <strong>Agent Gate / Monad</strong>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="receive-qr">
          {src && <img src={src} alt="" />}
          <span className="monad-mark" aria-hidden="true" />
        </div>
        <h2>Monad Address</h2>
        <p>Use this address to receive tokens and collectibles on Monad</p>
        <p className="mono receive-full">{MONAD_RECEIVE_ADDRESS}</p>
      </div>
    </div>
  );
}
