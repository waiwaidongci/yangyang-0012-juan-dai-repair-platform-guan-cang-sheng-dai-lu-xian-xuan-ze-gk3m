def profile_work(cx):
    return cx.execute("""
        SELECT c.id,c.excerpt,c.stage,s.reel,p.target_seconds,p.target_channels FROM conservation_cards c
        JOIN signal_excerpts s ON s.code=c.excerpt JOIN reel_capture_profiles p ON p.reel=s.reel
        ORDER BY c.id DESC
    """).fetchall()

def quality_board(cx):
    return {"work":profile_work(cx),"checks":cx.execute("""
        SELECT a.*,s.reel,m.filename AS source_filename FROM audio_derivative_checks a
        JOIN conservation_cards c ON c.id=a.card JOIN signal_excerpts s ON s.code=c.excerpt
        LEFT JOIN audio_derivative_checks m ON m.id=a.source_derivative ORDER BY a.id DESC
    """).fetchall(),"packages":cx.execute("""
        SELECT p.*,m.filename AS master_filename,m.measured_digest AS master_digest,
          mc.excerpt AS master_excerpt,a.filename AS copy_filename,a.measured_digest AS copy_digest,
          ac.excerpt AS copy_excerpt,a.source_derivative,a.source_digest,sm.filename AS source_filename
        FROM reel_archive_packages p
        JOIN audio_derivative_checks m ON m.id=p.master
        JOIN conservation_cards mc ON mc.id=m.card
        JOIN audio_derivative_checks a ON a.id=p.access_copy
        JOIN conservation_cards ac ON ac.id=a.card
        LEFT JOIN audio_derivative_checks sm ON sm.id=a.source_derivative
        ORDER BY p.id DESC
    """).fetchall()}

def seed(cx):
    cx.execute("""
        INSERT INTO reel_capture_profiles SELECT code,480,1 FROM acetate_reels WHERE code='YT-26'
        ON CONFLICT DO NOTHING
    """)
