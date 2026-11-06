"""
Minimal English Reader - Local Preview Server
Run this script to open on your phone or computer.
"""

import http.server
import socketserver
import socket
import webbrowser
import os

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

def get_ip_addresses():
    ips = []
    try:
        # Connect to a dummy external address to determine preferred outbound IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0)
        s.connect(('10.254.254.254', 1))
        preferred_ip = s.getsockname()[0]
        s.close()
        ips.append(preferred_ip)
    except Exception:
        pass

    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith('127.') and ip not in ips:
                ips.append(ip)
    except Exception:
        pass

    return ips

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def run():
    os.chdir(DIRECTORY)
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        ips = get_ip_addresses()
        print("=" * 60)
        print("📖 极简英文 · 读与记 (Minimal English Reader) 服务已启动！")
        print("=" * 60)
        print(f"💻 本机电脑浏览器访问:  http://localhost:{PORT}")
        if ips:
            print(f"📱 手机在同一局域网/Wi-Fi下访问:")
            for ip in ips:
                print(f"   👉 http://{ip}:{PORT}")
        print("=" * 60)
        print("💡 手机使用秘籍：在手机浏览器中打开网址后，点击「添加到主屏幕」，")
        print("   即可像真正的原生 App 一样全屏无地址栏使用，断网亦可阅读！")
        print("=" * 60)
        print("按 Ctrl + C 停止服务\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n服务已关闭。")

if __name__ == '__main__':
    run()
