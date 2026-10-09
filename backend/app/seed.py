"""Idempotent demo fixture. No real users or private data."""

from datetime import datetime, timedelta, timezone
from .db import connect


def seed():
    with connect() as db:
        if db.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            return
        now = datetime.now(timezone.utc)
        people = [
            ("alex", "Alex Morgan", "🌿"),
            ("maya", "Maya Chen", "🌸"),
            ("jordan", "Jordan Lee", "🏔️"),
            ("sam", "Sam Rivera", "☀️"),
            ("riley", "Riley Park", "🎨"),
            ("priya", "Priya Shah", "🚀"),
            ("noah", "Noah Brooks", "🌊"),
            ("ella", "Ella Kim", "🎧"),
        ]
        for name, display, avatar in people:
            db.execute(
                "INSERT INTO users(username,display_name,avatar,last_seen) VALUES (?,?,?,?)",
                (name, display, avatar, now.isoformat()),
            )
        for a in range(1, len(people) + 1):
            for b in range(1, len(people) + 1):
                if a != b:
                    db.execute("INSERT INTO contacts VALUES (?,?)", (a, b))
        chats = [
            ("direct", None, "1:2", [1, 2]),
            ("group", "Weekend plans", None, [1, 2, 3, 4]),
            ("direct", None, "1:3", [1, 3]),
            ("direct", None, "1:4", [1, 4]),
            ("group", "Design circle", None, [1, 2, 5]),
            ("group", "Project launch", None, [1, 6, 7, 8]),
            ("direct", None, "1:6", [1, 6]),
            ("group", "Study buddies", None, [2, 6, 8]),
            ("direct", None, "3:7", [3, 7]),
            ("direct", None, "5:8", [5, 8]),
        ]
        samples = [
            [
                (2, "Hey Alex! How’s your day going?"),
                (1, "Pretty good! Just finished the first version of our project."),
                (2, "That’s exciting! Can’t wait to see it ✨"),
                (1, "I’ll give you a walkthrough tomorrow. Coffee first?"),
                (2, "Absolutely. The little place on Oak Street?"),
                (1, "Perfect. See you at 10 ☕"),
                (2, "Sounds like a plan!"),
            ],
            [
                (3, "Who’s up for a hike this weekend? 🏔️"),
                (4, "Count me in!"),
                (1, "Me too. Let’s start early."),
                (2, "I’ll bring snacks 🥨"),
            ],
            [
                (1, "Thanks for sharing that playlist!"),
                (3, "Of course! Track 4 is my favorite 🎵"),
            ],
            [
                (4, "Made it home safely!"),
                (1, "Good to hear. It was great catching up."),
                (4, "Let’s do it again soon ☀️"),
            ],
            [
                (5, "A little inspiration for the next project 🎨"),
                (2, "Love the colors!"),
                (1, "The details make all the difference."),
            ],
            [
                (6, "The launch checklist is ready for review."),
                (1, "I’ll check the API flow this afternoon."),
                (7, "I’m testing the mobile layout now 📱"),
                (8, "Great — I’ll write up the release notes."),
            ],
            [
                (6, "I shared the final mockup in our group."),
                (1, "Thanks Priya. The spacing looks much better."),
                (6, "Small details make the difference ✨"),
            ],
            [
                (8, "Anyone free to review the database diagram?"),
                (2, "I can take a look after class."),
                (6, "I’ll review the relationships too."),
            ],
            [
                (7, "The trail photos turned out great!"),
                (3, "Send me your favorite one when you get a chance 🏔️"),
            ],
            [
                (8, "Could you send over the design notes?"),
                (5, "Of course — I’ll put them together today."),
            ],
        ]
        for index, ((kind, name, key, members), messages) in enumerate(
            zip(chats, samples)
        ):
            cid = db.execute(
                "INSERT INTO conversations(kind,name,direct_key,created_at) VALUES (?,?,?,?)",
                (kind, name, key, now.isoformat()),
            ).lastrowid
            for uid in members:
                db.execute(
                    "INSERT INTO members(conversation_id,user_id,role) VALUES (?,?,?)",
                    (cid, uid, "admin" if kind == "group" and uid == 1 else "member"),
                )
            for j, (sender, body) in enumerate(messages):
                stamp = (
                    now - timedelta(days=index // 3, minutes=(index % 3) * 70 + (len(messages) - j) * 3)
                ).isoformat()
                mid = db.execute(
                    "INSERT INTO messages(conversation_id,sender_id,body,created_at,client_id) VALUES (?,?,?,?,?)",
                    (cid, sender, body, stamp, f"seed-{index}-{j}"),
                ).lastrowid
                for uid in members:
                    if uid != sender:
                        unread = uid == 1 and index in (0, 1) and j == len(messages) - 1
                        db.execute(
                            "INSERT INTO receipts VALUES (?,?,?,?)",
                            (mid, uid, stamp, None if unread else stamp),
                        )
