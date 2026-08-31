const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function encodeLength(len) {
  if (len < 128) return Buffer.from([len]);
  const bytes = [];
  while (len > 0) {
    bytes.unshift(len & 0xff);
    len >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function derTag(tag, body) {
  return Buffer.concat([Buffer.from([tag]), encodeLength(body.length), body]);
}

function derSequence(items) {
  return derTag(0x30, Buffer.concat(items));
}

function derSet(items) {
  return derTag(0x31, Buffer.concat(items));
}

function derInteger(num) {
  let buf;
  if (typeof num === 'number') {
    buf = Buffer.from([num]);
  } else {
    buf = num;
  }
  if (buf[0] & 0x80) {
    buf = Buffer.concat([Buffer.from([0x00]), buf]);
  }
  return derTag(0x02, buf);
}

function derOID(oidStr) {
  const parts = oidStr.split('.').map(Number);
  const bytes = [parts[0] * 40 + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let val = parts[i];
    const valBytes = [];
    valBytes.unshift(val & 0x7f);
    val >>= 7;
    while (val > 0) {
      valBytes.unshift((val & 0x7f) | 0x80);
      val >>= 7;
    }
    bytes.push(...valBytes);
  }
  return derTag(0x06, Buffer.from(bytes));
}

function derUTCTime(date) {
  const pad = n => (n < 10 ? '0' : '') + n;
  const str =
    (date.getUTCFullYear() % 100).toString().padStart(2, '0') +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z';
  return derTag(0x17, Buffer.from(str, 'ascii'));
}

function generateSelfSignedCert() {
  const keyPath = path.join(__dirname, 'key.pem');
  const certPath = path.join(__dirname, 'cert.pem');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
  }

  console.log('🔒 Generating self-signed HTTPS SSL Certificate (key.pem & cert.pem)...');

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const pubKeyObject = crypto.createPublicKey(publicKey);
  const pubKeyDer = pubKeyObject.export({ type: 'spki', format: 'der' });

  const serial = crypto.randomBytes(8);
  const sigAlg = derSequence([derOID('1.2.840.113549.1.1.11'), derTag(0x05, Buffer.alloc(0))]); // sha256WithRSAEncryption

  const issuerSubject = derSequence([
    derSet([
      derSequence([derOID('2.5.4.3'), derTag(0x0c, Buffer.from('PrintShopKioskLocalhost'))])
    ])
  ]);

  const now = new Date();
  const validFrom = new Date(now.getTime() - 86400000);
  const validTo = new Date(now.getTime() + 10 * 365 * 86400000);
  const validity = derSequence([derUTCTime(validFrom), derUTCTime(validTo)]);

  const tbsCertificate = derSequence([
    derTag(0xa0, derInteger(2)), // v3
    derInteger(serial),
    sigAlg,
    issuerSubject,
    validity,
    issuerSubject,
    pubKeyDer
  ]);

  const signer = crypto.createSign('SHA256');
  signer.update(tbsCertificate);
  const signature = signer.sign(privateKey);

  const bitStringSig = Buffer.concat([Buffer.from([0x00]), signature]);
  const derBitStringSig = derTag(0x03, bitStringSig);

  const certDer = derSequence([tbsCertificate, sigAlg, derBitStringSig]);

  const certPem =
    '-----BEGIN CERTIFICATE-----\n' +
    certDer.toString('base64').match(/.{1,64}/g).join('\n') +
    '\n-----END CERTIFICATE-----\n';

  fs.writeFileSync(keyPath, privateKey, 'utf8');
  fs.writeFileSync(certPath, certPem, 'utf8');
  console.log('✅ HTTPS SSL Certificate created successfully.');

  return {
    key: privateKey,
    cert: certPem
  };
}

module.exports = { generateSelfSignedCert };
