import json
import threading
import time
import os
import logging
from urllib.request import urlopen, Request
from flask import Flask, jsonify

# --- HỆ THỐNG HOANGDZ - TÀI XỈU MD5 (LOGIC CẦU) ---
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [TX-MD5] %(message)s')
logger = logging.getLogger(__name__)

PORT = 8002
KHOANG_CACH_QUET = 4

# KHO DỮ LIỆU CẦU MD5 (TRẦN NHẬT HOÀNG)
KHO_MD5 = {
    "1010": "1", "0101": "0", "110011": "0", "001100": "1",
    "1110": "0", "0001": "1", "101101": "0", "010010": "1"
}

du_lieu_md5 = {
    "ket_qua": {}, 
    "lich_su": [], 
    "du_doan": "Đang phân tích...", 
    "loai_cau": "Đang quét API..."
}

phien_cu_cuoi = None

def logic_soi_cau_md5(danh_sach):
    if len(danh_sach) < 5: return "CHỜ PHIÊN", "Dữ liệu chưa đủ"
    
    chuoi = "".join(["1" if h['Tong'] >= 11 else "0" for h in reversed(danh_sach[:20])])

    # Quét theo kho dữ liệu MD5
    for do_dai in range(6, 4, -1):
        mau = chuoi[-do_dai:]
        if mau in KHO_MD5:
            res = "TÀI" if KHO_MD5[mau] == "1" else "XỈU"
            return res, f"Cầu MD5 V24-{do_dai}"

    # Kiểm tra cầu nhảy 1-1
    if chuoi.endswith("1010") or chuoi.endswith("0101"):
        return ("TÀI" if chuoi[-1] == "0" else "XỈU"), "Cầu Nhảy 1-1"

    return "CHỜ TÍN HIỆU", "Cầu không ổn định"

def quet_api_md5():
    global phien_cu_cuoi
    duong_dan = "https://jakpotgwab.geightdors.net/glms/v1/notify/taixiu?platform_id=g8&gid=vgmn_101"
    
    while True:
        try:
            yeu_cau = Request(duong_dan, headers={'User-Agent': 'Mozilla/5.0'})
            with urlopen(yeu_cau, timeout=10) as phan_hoi:
                du_lieu = json.loads(phan_hoi.read().decode('utf-8'))
            
            if du_lieu.get('status') == 'OK' and du_lieu.get('data'):
                for game in du_lieu['data']:
                    if game.get("cmd") == 2006:
                        sid = game.get("sid")
                        xuc_xac = [game.get("d1"), game.get("d2"), game.get("d3")]
                        
                        if sid and sid != phien_cu_cuoi and None not in xuc_xac:
                            phien_cu_cuoi = sid
                            tong = sum(xuc_xac)
                            kq_chu = "Tài" if tong >= 11 else "Xỉu"
                            
                            phien_moi = {"Phien": sid, "Xuc_xac": xuc_xac, "Tong": tong, "Ket_qua": kq_chu}
                            du_lieu_md5["lich_su"].insert(0, phien_moi)
                            
                            du_doan, ten_cau = logic_soi_cau_md5(du_lieu_md5["lich_su"])
                            du_lieu_md5.update({"du_doan": du_doan, "loai_cau": ten_cau, "ket_qua": phien_moi})
                            logger.info(f"MD5 {sid}: {kq_chu} -> Dự đoán: {du_doan} ({ten_cau})")
        except: pass
        time.sleep(KHOANG_CACH_QUET)

app = Flask(__name__)
@app.route("/api/taixiumd5", methods=["GET"])
def lay_api_md5():
    return jsonify({
        "tac_gia": "TRẦN NHẬT HOÀNG",
        "ten_tool": "HOANGDZ MD5 - ANTI RANDOM",
        "du_doan": du_lieu_md5["du_doan"],
        "loai_cau": du_lieu_md5["loai_cau"],
        "phien_vua_ra": du_lieu_md5["ket_qua"]
    })

if __name__ == "__main__":
    threading.Thread(target=quet_api_md5, daemon=True).start()
    app.run(host='0.0.0.0', port=PORT)
