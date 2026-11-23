from decimal import Decimal

from fastapi import HTTPException

from extensions.rights.service import lock_reel

def metadata_rules(manifest):
    notes = []
    if manifest["expected_digest"]!=manifest["measured_digest"]:
        notes.append("入档清单与实测 SHA-256 不一致")
    if abs(manifest["duration_seconds"]-manifest["target_seconds"])>Decimal(".5"):
        notes.append("与馆藏时长差超过半秒")
    if manifest["channels"]!=manifest["target_channels"]:
        notes.append("声道数与采集登记不符")
    allowed = (96000,192000) if manifest["kind"]=="master" else (44100,48000)
    if manifest["sample_rate"] not in allowed:
        notes.append("采样率与入档用途不匹配")
    if manifest["clipped_frames"]:
        notes.append("采集报告含削波帧")
    return notes

def derivative_of_reel(cx, identifier):
    return cx.execute("""
        SELECT d.*,s.reel FROM audio_derivative_checks d
        JOIN conservation_cards c ON c.id=d.card JOIN signal_excerpts s ON s.code=c.excerpt
        WHERE d.id=%s
    """,(identifier,)).fetchone()

def submit(cx,data,actor):
    card = cx.execute("""
        SELECT c.stage,s.reel FROM conservation_cards c JOIN signal_excerpts s ON s.code=c.excerpt
        JOIN reel_capture_profiles p ON p.reel=s.reel WHERE c.id=%s
    """,(data.card,)).fetchone()
    if not card or card["stage"]!="authorised":
        raise HTTPException(409,"请选已签发且有采集规格的工序卡")
    if data.kind=="access":
        if not data.source_derivative or not data.source_digest:
            raise HTTPException(422,"访问副本送检须登记取用的母版及校验值")
        source = derivative_of_reel(cx,data.source_derivative)
        if not source or source["kind"]!="master":
            raise HTTPException(409,"取用来源须为已登记的保存母版")
        if source["reel"]!=card["reel"]:
            raise HTTPException(409,"取用的母版与副本须属同一馆藏卷")
    elif data.source_derivative or data.source_digest:
        raise HTTPException(422,"保存母版不登记取用来源")
    return cx.execute("""
        INSERT INTO audio_derivative_checks
          (card,kind,filename,expected_digest,measured_digest,duration_seconds,
           sample_rate,channels,clipped_frames,source_derivative,source_digest,recorded_by)
        VALUES (%(card)s,%(kind)s,%(filename)s,%(expected_digest)s,%(measured_digest)s,
                %(duration_seconds)s,%(sample_rate)s,%(channels)s,%(clipped_frames)s,
                %(source_derivative)s,%(source_digest)s,%(actor)s)
        RETURNING *
    """,data.model_dump()|{"actor":actor}).fetchone()

def verify(cx, identifier, actor):
    result = cx.execute("""
        SELECT d.*,p.target_seconds,p.target_channels FROM audio_derivative_checks d
        JOIN conservation_cards c ON c.id=d.card JOIN signal_excerpts s ON s.code=c.excerpt
        JOIN reel_capture_profiles p ON p.reel=s.reel WHERE d.id=%s FOR UPDATE OF d
    """,(identifier,)).fetchone()
    if not result:
        raise HTTPException(404,"质检记录不存在")
    if result["stage"]!="queued":
        raise HTTPException(409,"请创建新一版派生件记录供复测")
    notes = metadata_rules(result)
    return cx.execute("""
        UPDATE audio_derivative_checks SET stage=%s,review_by=%s,failed_rules=%s WHERE id=%s RETURNING *
    """,("failed" if notes else "accepted",actor,notes,identifier)).fetchone()

def package_label(identifier):
    return f"包 #{identifier}" if identifier else "空档（无现用包）"

def switch_problems(data,current,master,copy):
    problems = []
    if master["kind"]!="master":
        problems.append("所选记录不是保存母版")
    elif master["reel"]!=data.reel:
        problems.append("保存母版不属于该卷")
    elif master["stage"]!="accepted":
        problems.append("保存母版未通过质检")
    if copy["kind"]!="access":
        problems.append("所选记录不是访问副本")
    elif copy["reel"]!=data.reel:
        problems.append("访问副本不属于该卷")
    elif copy["stage"]!="accepted":
        problems.append("访问副本未通过质检")
    if not problems and copy["source_digest"]!=master["measured_digest"]:
        problems.append("副本登记的源校验值与新母版实测值不符")
    if not problems and current \
        and current["master"]==data.master and current["access_copy"]==data.access_copy:
        problems.append("与现用包组成相同，无需换包")
    return problems

def request_switch(cx,data,actor):
    lock_reel(cx,data.reel)
    master = derivative_of_reel(cx,data.master)
    copy = derivative_of_reel(cx,data.access_copy)
    if not master or not copy:
        raise HTTPException(409,"所选派生件记录不存在")
    current = cx.execute(
        "SELECT * FROM reel_archive_packages WHERE reel=%s AND stage='current'",(data.reel,)
    ).fetchone()
    base = current["id"] if current else None
    if data.base_package!=base:
        stage = "superseded"
        conclusion = f"申请基于{package_label(data.base_package)}，提交时现用包为{package_label(base)}，本申请落选"
    else:
        problems = switch_problems(data,current,master,copy)
        if problems:
            stage,conclusion = "rejected","；".join(problems)
        else:
            if current:
                cx.execute(
                    "UPDATE reel_archive_packages SET stage='replaced' WHERE id=%s",(current["id"],)
                )
            stage,conclusion = "current",""
    return cx.execute("""
        INSERT INTO reel_archive_packages
          (reel,base_package,master,access_copy,requested_by,stage,conclusion)
        VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *
    """,(data.reel,data.base_package,data.master,data.access_copy,actor,stage,conclusion)).fetchone()
