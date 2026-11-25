#!/usr/bin/env python3
"""Build the Star Earth Movers Billing Android app (APK) without the Android SDK.

The app is a full-screen WebView showing the billing page (assets/index.html).
This script does what Android Studio would:

  1. compiles the Java sources (javac) against android.jar, then to classes.dex (dx)
  2. writes the binary AndroidManifest.xml and resources.arsc (for the app icon)
  3. packs everything into a zip with 4-byte aligned stored entries (zipalign)
  4. signs it with APK Signature Scheme v2 (Android 7.0+)

Usage:
  python3 build_apk.py --deps DIR --out app.apk [--key signing/key.pem --cert signing/cert.pem]

DIR must contain android.jar (com.google.android:android:4.1.1.4 from Maven Central)
and dx.jar (com.jakewharton.android.repackaged:dalvik-dx:16.0.1). Python needs the
"cryptography" package. If --key/--cert do not exist they are created; keep them:
updates to the app must be signed with the same key or Android refuses to install them.
"""
import argparse
import datetime
import hashlib
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
PACKAGE = 'com.starearthmovers.billing'
VERSION_CODE = 3
VERSION_NAME = '1.2'
APP_LABEL = 'Star Billing'
MIN_SDK, TARGET_SDK = 24, 34
ICON_RES_ID = 0x7f010000  # @mipmap/ic_launcher (package 0x7f, type 1, entry 0)
ANDROID_NS = 'http://schemas.android.com/apk/res/android'

# android:* attribute resource ids (from the platform's public.xml)
ATTR = {
    'label': 0x01010001, 'icon': 0x01010002, 'name': 0x01010003, 'exported': 0x01010010,
    'authorities': 0x01010018, 'grantUriPermissions': 0x0101001b, 'configChanges': 0x0101001f,
    'minSdkVersion': 0x0101020c, 'versionCode': 0x0101021b, 'versionName': 0x0101021c,
    'windowSoftInputMode': 0x0101022b, 'targetSdkVersion': 0x01010270, 'maxSdkVersion': 0x01010271,
    'allowBackup': 0x01010280, 'hardwareAccelerated': 0x010102d3,
}
T_REF, T_STRING, T_INT_DEC, T_INT_HEX, T_BOOL = 0x01, 0x03, 0x10, 0x11, 0x12


# ----------------------------------------------------------------------------- manifest
def S(v): return ('s', v)
def I(v): return ('i', v)
def H(v): return ('h', v)
def B(v): return ('b', v)
def R(v): return ('r', v)


def manifest_tree():
    """(tag, [(ns?, name, value)], children). ns True = android: attribute."""
    config_changes = 0x80 | 0x20 | 0x400 | 0x800 | 0x100  # orientation|keyboardHidden|screenSize|smallestScreenSize|screenLayout
    return ('manifest', [(True, 'versionCode', I(VERSION_CODE)), (True, 'versionName', S(VERSION_NAME)),
                         (False, 'package', S(PACKAGE))], [
        ('uses-sdk', [(True, 'minSdkVersion', I(MIN_SDK)), (True, 'targetSdkVersion', I(TARGET_SDK))], []),
        ('uses-permission', [(True, 'name', S('android.permission.WRITE_EXTERNAL_STORAGE')),
                             (True, 'maxSdkVersion', I(28))], []),
        ('application', [(True, 'label', S(APP_LABEL)), (True, 'icon', R(ICON_RES_ID)),
                         (True, 'allowBackup', B(True)), (True, 'hardwareAccelerated', B(True))], [
            ('activity', [(True, 'name', S(PACKAGE + '.MainActivity')), (True, 'exported', B(True)),
                          (True, 'configChanges', H(config_changes)), (True, 'windowSoftInputMode', H(0x10))], [
                ('intent-filter', [], [
                    ('action', [(True, 'name', S('android.intent.action.MAIN'))], []),
                    ('category', [(True, 'name', S('android.intent.category.LAUNCHER'))], []),
                ]),
            ]),
            ('provider', [(True, 'name', S(PACKAGE + '.ShareProvider')),
                          (True, 'authorities', S(PACKAGE + '.share')),
                          (True, 'exported', B(False)), (True, 'grantUriPermissions', B(True))], []),
        ]),
    ])


def _len8(n):
    return bytes([n]) if n < 0x80 else bytes([(n >> 8) | 0x80, n & 0xff])


def string_pool(strings):
    """UTF-8 ResStringPool chunk."""
    offsets, data = [], b''
    for st in strings:
        enc = st.encode('utf-8')
        offsets.append(len(data))
        data += _len8(len(st)) + _len8(len(enc)) + enc + b'\x00'
    while len(data) % 4:
        data += b'\x00'
    header_size = 28
    strings_start = header_size + 4 * len(strings)
    size = strings_start + len(data)
    out = struct.pack('<HHIIIIII', 0x0001, header_size, size, len(strings), 0, 0x100, strings_start, 0)
    out += b''.join(struct.pack('<I', o) for o in offsets) + data
    return out


def build_axml(tree):
    # strings: attribute names with resource ids first (in resource-map order), then the rest
    attr_names, others = [], []

    def walk(node):
        tag, attrs, kids = node
        for ns, name, val in attrs:
            if ns and name not in attr_names:
                attr_names.append(name)
        for ns, name, val in attrs:
            if not ns and name not in others:
                others.append(name)
            if val[0] == 's' and val[1] not in others:
                others.append(val[1])
        if tag not in others:
            others.append(tag)
        for k in kids:
            walk(k)
    walk(tree)
    attr_names.sort(key=lambda n: ATTR[n])
    for extra in ('android', ANDROID_NS):
        if extra not in others:
            others.append(extra)
    strings = attr_names + [o for o in others if o not in attr_names]
    idx = {st: i for i, st in enumerate(strings)}

    body = b''
    resmap = struct.pack('<HHI', 0x0180, 8, 8 + 4 * len(attr_names)) + b''.join(struct.pack('<I', ATTR[n]) for n in attr_names)
    ns_chunk = lambda t: struct.pack('<HHIIiII', t, 16, 24, 1, -1, idx['android'], idx[ANDROID_NS])
    body += ns_chunk(0x0100)
    NONE = 0xFFFFFFFF

    def emit(node):
        nonlocal body
        tag, attrs, kids = node
        ordered = sorted(attrs, key=lambda a: (0, ATTR[a[1]]) if a[0] else (1, idx[a[1]]))
        ab = b''
        for ns, name, (kind, v) in ordered:
            ns_i = idx[ANDROID_NS] if ns else NONE
            if kind == 's':
                raw, typ, data = idx[v], T_STRING, idx[v]
            elif kind == 'i':
                raw, typ, data = NONE, T_INT_DEC, v
            elif kind == 'h':
                raw, typ, data = NONE, T_INT_HEX, v
            elif kind == 'b':
                raw, typ, data = NONE, T_BOOL, 0xFFFFFFFF if v else 0
            else:
                raw, typ, data = NONE, T_REF, v
            ab += struct.pack('<IIIHBBI', ns_i, idx[name], raw, 8, 0, typ, data)
        size = 16 + 20 + len(ab)
        body += struct.pack('<HHIIi', 0x0102, 16, size, 1, -1)
        body += struct.pack('<IIHHHHHH', NONE, idx[tag], 0x14, 0x14, len(attrs), 0, 0, 0) + ab
        for k in kids:
            emit(k)
        body += struct.pack('<HHIIiII', 0x0103, 16, 24, 1, -1, NONE, idx[tag])
    emit(tree)
    body += ns_chunk(0x0101)
    payload = string_pool(strings) + resmap + body
    return struct.pack('<HHI', 0x0003, 8, 8 + len(payload)) + payload


# ----------------------------------------------------------------------------- resources.arsc
def build_arsc():
    """One resource: @mipmap/ic_launcher -> res/mipmap/ic_launcher.png (nodpi, so not rescaled)."""
    values = string_pool(['res/mipmap/ic_launcher.png'])
    type_strings = string_pool(['mipmap'])
    key_strings = string_pool(['ic_launcher'])

    spec = struct.pack('<HHIBBHI', 0x0202, 16, 16 + 4, 1, 0, 0, 1) + struct.pack('<I', 0)
    config = bytearray(64)
    struct.pack_into('<I', config, 0, 64)
    struct.pack_into('<H', config, 14, 0xFFFF)  # density = nodpi
    entry = struct.pack('<HHI', 8, 0, 0) + struct.pack('<HBBI', 8, 0, T_STRING, 0)
    type_header_size = 20 + 64
    entries_start = type_header_size + 4
    type_chunk = struct.pack('<HHIBBHII', 0x0201, type_header_size, entries_start + len(entry), 1, 0, 0, 1, entries_start)
    type_chunk += bytes(config) + struct.pack('<I', 0) + entry

    pkg_header_size = 288
    name = PACKAGE.encode('utf-16-le')[:254].ljust(256, b'\x00')
    type_str_off = pkg_header_size
    key_str_off = type_str_off + len(type_strings)
    pkg_body = type_strings + key_strings + spec + type_chunk
    pkg = struct.pack('<HHII', 0x0200, pkg_header_size, pkg_header_size + len(pkg_body), 0x7f) + name
    pkg += struct.pack('<IIIII', type_str_off, 1, key_str_off, 1, 0) + pkg_body

    payload = values + pkg
    return struct.pack('<HHII', 0x0002, 12, 12 + len(payload), 1) + payload


# ----------------------------------------------------------------------------- zip (aligned)
def dos_time(t):
    lt = time.localtime(t)
    return ((lt.tm_hour << 11) | (lt.tm_min << 5) | (lt.tm_sec // 2),
            ((lt.tm_year - 1980) << 9) | (lt.tm_mon << 5) | lt.tm_mday)


def build_zip(files):
    """files: list of (name, bytes, store). Stored entries are 4-byte aligned like zipalign."""
    out, central = bytearray(), bytearray()
    t, d = dos_time(time.mktime((2026, 1, 1, 0, 0, 0, 0, 0, -1)))
    for name, data, store in files:
        nb = name.encode('utf-8')
        crc = zlib.crc32(data) & 0xffffffff
        if store:
            method, comp = 0, data
        else:
            c = zlib.compressobj(9, zlib.DEFLATED, -15)
            method, comp = 8, c.compress(data) + c.flush()
        offset = len(out)
        extra = b''
        if store:
            pad = (4 - (offset + 30 + len(nb)) % 4) % 4
            extra = b'\x00' * pad
        out += struct.pack('<IHHHHHIIIHH', 0x04034b50, 20, 0x0800, method, t, d, crc, len(comp), len(data), len(nb), len(extra))
        out += nb + extra + comp
        central += struct.pack('<IHHHHHHIIIHHHHHII', 0x02014b50, 20, 20, 0x0800, method, t, d, crc, len(comp), len(data),
                               len(nb), 0, 0, 0, 0, 0, offset) + nb
    cd_offset = len(out)
    eocd = struct.pack('<IHHHHIIH', 0x06054b50, 0, 0, len(files), len(files), len(central), cd_offset, 0)
    return bytes(out), bytes(central), eocd


# ----------------------------------------------------------------------------- v2 signing
def lp(b):  # uint32 length-prefixed
    return struct.pack('<I', len(b)) + b


def chunked_sha256(sections):
    digests = []
    for sec in sections:
        for i in range(0, len(sec), 1 << 20):
            chunk = sec[i:i + (1 << 20)]
            digests.append(hashlib.sha256(b'\xa5' + struct.pack('<I', len(chunk)) + chunk).digest())
    return hashlib.sha256(b'\x5a' + struct.pack('<I', len(digests)) + b''.join(digests)).digest()


def load_or_create_key(key_path, cert_path):
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID
    if os.path.exists(key_path) and os.path.exists(cert_path):
        key = serialization.load_pem_private_key(open(key_path, 'rb').read(), None)
        cert = x509.load_pem_x509_certificate(open(cert_path, 'rb').read())
        return key, cert
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'Star Earth Movers Billing'),
                      x509.NameAttribute(NameOID.COUNTRY_NAME, 'IN')])
    now = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now)
            .not_valid_after(now + datetime.timedelta(days=365 * 30)).sign(key, hashes.SHA256()))
    os.makedirs(os.path.dirname(key_path) or '.', exist_ok=True)
    with open(key_path, 'wb') as f:
        f.write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    os.chmod(key_path, 0o600)
    with open(cert_path, 'wb') as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    print('created new signing key:', key_path)
    return key, cert


def sign_v2(entries, central, eocd, key, cert):
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
    ALG = 0x0103  # RSASSA-PKCS1-v1_5 with SHA2-256, chunked SHA-256 content digest
    digest = chunked_sha256([entries, central, eocd])
    cert_der = cert.public_bytes(serialization.Encoding.DER)
    pub_der = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    signed_data = lp(lp(struct.pack('<I', ALG) + lp(digest))) + lp(lp(cert_der)) + lp(b'')
    sig = key.sign(signed_data, padding.PKCS1v15(), hashes.SHA256())
    signer = lp(signed_data) + lp(lp(struct.pack('<I', ALG) + lp(sig))) + lp(pub_der)
    v2_value = lp(lp(signer))
    pair = struct.pack('<Q', 4 + len(v2_value)) + struct.pack('<I', 0x7109871a) + v2_value
    block_size = len(pair) + 8 + 16  # pairs + trailing size + magic
    block = struct.pack('<Q', block_size) + pair + struct.pack('<Q', block_size) + b'APK Sig Block 42'
    new_cd_offset = len(entries) + len(block)
    new_eocd = eocd[:16] + struct.pack('<I', new_cd_offset) + eocd[20:]
    return entries + block + central + new_eocd


# ----------------------------------------------------------------------------- build
def compile_dex(deps, work):
    stubs, classes = os.path.join(work, 'stubs'), os.path.join(work, 'classes')
    os.makedirs(stubs); os.makedirs(classes)
    android_jar = os.path.join(deps, 'android.jar')
    def javac(cp, out, src_dir):
        srcs = [os.path.join(r, f) for r, _, fs in os.walk(src_dir) for f in fs if f.endswith('.java')]
        subprocess.run(['javac', '-nowarn', '--release', '8', '-Xlint:-options', '-cp', cp, '-d', out] + srcs, check=True)
    javac(android_jar, stubs, os.path.join(HERE, 'stubs'))  # compile-only stand-ins, not packaged
    javac(stubs + os.pathsep + android_jar, classes, os.path.join(HERE, 'src'))
    dex = os.path.join(work, 'classes.dex')
    subprocess.run(['java', '-cp', os.path.join(deps, 'dx.jar'), 'com.android.dx.command.Main', '--dex',
                    '--min-sdk-version=%d' % MIN_SDK, '--output=' + dex, classes], check=True)
    return open(dex, 'rb').read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--deps', required=True)
    ap.add_argument('--html', default=os.path.join(HERE, '..', 'star-earth-movers-billing.html'))
    ap.add_argument('--out', default=os.path.join(HERE, 'StarBilling.apk'))
    ap.add_argument('--key', default=os.path.join(HERE, 'signing', 'key.pem'))
    ap.add_argument('--cert', default=os.path.join(HERE, 'signing', 'cert.pem'))
    a = ap.parse_args()

    work = tempfile.mkdtemp(prefix='apkbuild-')
    try:
        dex = compile_dex(a.deps, work)
        files = [
            ('AndroidManifest.xml', build_axml(manifest_tree()), False),
            ('classes.dex', dex, False),
            ('resources.arsc', build_arsc(), True),                       # must be stored + aligned
            ('res/mipmap/ic_launcher.png', open(os.path.join(HERE, 'res', 'ic_launcher.png'), 'rb').read(), True),
            ('assets/index.html', open(a.html, 'rb').read(), False),
        ]
        entries, central, eocd = build_zip(files)
        key, cert = load_or_create_key(a.key, a.cert)
        apk = sign_v2(entries, central, eocd, key, cert)
        with open(a.out, 'wb') as f:
            f.write(apk)
        print('wrote %s (%d KB)' % (a.out, len(apk) // 1024))
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
