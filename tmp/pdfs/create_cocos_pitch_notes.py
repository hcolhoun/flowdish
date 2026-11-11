from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


OUTPUT = Path(__file__).resolve().parents[2] / "output" / "pdf" / "cocos-flowdish-call-pitch-notes.pdf"

PAGE_W, PAGE_H = A4
MARGIN_X = 15 * mm
MARGIN_TOP = 18 * mm
MARGIN_BOTTOM = 16 * mm

INK = colors.HexColor("#15202B")
MUTED = colors.HexColor("#52606D")
RED = colors.HexColor("#B42318")
RED_DARK = colors.HexColor("#7A271A")
RED_PALE = colors.HexColor("#FEF3F2")
TEAL = colors.HexColor("#087F8C")
TEAL_PALE = colors.HexColor("#ECFDFD")
LINE = colors.HexColor("#D7DEE5")
PALE = colors.HexColor("#F6F8FA")
WHITE = colors.white


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="CoverEyebrow",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=11,
        textColor=RED,
        spaceAfter=5,
    )
)
styles.add(
    ParagraphStyle(
        name="CoverTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=27,
        leading=29,
        textColor=INK,
        alignment=TA_LEFT,
        spaceAfter=6,
    )
)
styles.add(
    ParagraphStyle(
        name="CoverSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=11,
        leading=15,
        textColor=MUTED,
        spaceAfter=12,
    )
)
styles.add(
    ParagraphStyle(
        name="SectionEyebrow",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=RED,
        spaceAfter=3,
    )
)
styles.add(
    ParagraphStyle(
        name="SectionTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=23,
        textColor=INK,
        spaceAfter=9,
    )
)
styles.add(
    ParagraphStyle(
        name="H2Custom",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=INK,
        spaceBefore=5,
        spaceAfter=5,
    )
)
styles.add(
    ParagraphStyle(
        name="BodyCustom",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.2,
        leading=12.2,
        textColor=INK,
        spaceAfter=5,
    )
)
styles.add(
    ParagraphStyle(
        name="SmallCustom",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.1,
        leading=10.4,
        textColor=MUTED,
    )
)
styles.add(
    ParagraphStyle(
        name="BoxTitle",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=10.2,
        leading=12,
        textColor=INK,
        spaceAfter=4,
    )
)
styles.add(
    ParagraphStyle(
        name="Quote",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10.2,
        leading=14.2,
        textColor=INK,
    )
)
styles.add(
    ParagraphStyle(
        name="TableHead",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=8.2,
        leading=10,
        textColor=WHITE,
    )
)
styles.add(
    ParagraphStyle(
        name="TableBody",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.2,
        leading=10.5,
        textColor=INK,
    )
)
styles.add(
    ParagraphStyle(
        name="Footer",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.3,
        leading=8,
        textColor=colors.HexColor("#667085"),
    )
)


def red(text: str) -> str:
    return f'<font color="{RED.hexval()}"><b>{text}</b></font>'


def p(text: str, style: str = "BodyCustom") -> Paragraph:
    return Paragraph(text, styles[style])


def section(eyebrow: str, title: str):
    return [p(eyebrow.upper(), "SectionEyebrow"), p(title, "SectionTitle")]


def rule():
    return Table(
        [[""]],
        colWidths=[PAGE_W - 2 * MARGIN_X],
        rowHeights=[1],
        style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), RED)]),
    )


def box(title: str, body: str, fill=PALE, border=LINE, width=None, title_style="BoxTitle"):
    width = width or (PAGE_W - 2 * MARGIN_X)
    content = [[p(title, title_style)], [p(body, "BodyCustom")]]
    table = Table(content, colWidths=[width], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), fill),
                ("BOX", (0, 0), (-1, -1), 0.8, border),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, 0), 8),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
                ("TOPPADDING", (0, 1), (-1, 1), 2),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 8),
            ]
        )
    )
    return table


def two_boxes(left_title, left_body, right_title, right_body, fills=(PALE, PALE)):
    gap = 6 * mm
    width = (PAGE_W - 2 * MARGIN_X - gap) / 2
    table = Table(
        [[box(left_title, left_body, fills[0], width=width), box(right_title, right_body, fills[1], width=width)]],
        colWidths=[width, width],
        hAlign="LEFT",
    )
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return table


def flow_table(rows):
    data = [
        [p("ASK", "TableHead"), p("YES -> GO HERE", "TableHead"), p("NO -> GO HERE", "TableHead")]
    ]
    for ask, yes, no in rows:
        data.append([p(ask, "TableBody"), p(yes, "TableBody"), p(no, "TableBody")])
    table = Table(data, colWidths=[54 * mm, 58 * mm, 58 * mm], repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), INK),
                ("GRID", (0, 0), (-1, -1), 0.5, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("BACKGROUND", (0, 1), (-1, -1), WHITE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, PALE]),
            ]
        )
    )
    return table


def objection_table(rows):
    data = [[p("PUSH-BACK", "TableHead"), p("RESPONSE", "TableHead"), p("NEXT QUESTION", "TableHead")]]
    for objection, response, question in rows:
        data.append(
            [
                p(red(objection), "TableBody"),
                p(response, "TableBody"),
                p(question, "TableBody"),
            ]
        )
    table = Table(data, colWidths=[42 * mm, 83 * mm, 45 * mm], repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), INK),
                ("GRID", (0, 0), (-1, -1), 0.5, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, PALE]),
            ]
        )
    )
    return table


def bullet(text: str):
    return p(f'{red("-")} {text}', "BodyCustom")


def page_header_footer(canvas, doc):
    canvas.saveState()
    page = canvas.getPageNumber()
    if page > 1:
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN_X, PAGE_H - 12 * mm, PAGE_W - MARGIN_X, PAGE_H - 12 * mm)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.setFillColor(INK)
        canvas.drawString(MARGIN_X, PAGE_H - 9.5 * mm, "COCOS + FLOWDISH")
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(PAGE_W - MARGIN_X, PAGE_H - 9.5 * mm, "CALL-SIDE PLAYBOOK")

    canvas.setStrokeColor(LINE)
    canvas.line(MARGIN_X, 11 * mm, PAGE_W - MARGIN_X, 11 * mm)
    canvas.setFont("Helvetica", 7.3)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN_X, 7.5 * mm, "Internal call notes - Oran Colhoun")
    canvas.drawRightString(PAGE_W - MARGIN_X, 7.5 * mm, f"{page}")
    canvas.restoreState()


doc = BaseDocTemplate(
    str(OUTPUT),
    pagesize=A4,
    rightMargin=MARGIN_X,
    leftMargin=MARGIN_X,
    topMargin=MARGIN_TOP,
    bottomMargin=MARGIN_BOTTOM,
    title="COCOS + Flowdish Call Pitch Notes",
    author="COCOS Culinary Operations Consultancy",
    subject="Warm and cold call pitch notes for COCOS and Flowdish",
)

frame = Frame(
    MARGIN_X,
    MARGIN_BOTTOM,
    PAGE_W - 2 * MARGIN_X,
    PAGE_H - MARGIN_TOP - MARGIN_BOTTOM,
    id="normal",
)
doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=page_header_footer)])

story = []

# PAGE 1 - QUICK CARD
story += [p("INTERNAL CALL-SIDE PLAYBOOK", "CoverEyebrow"), p("COCOS first. Flowdish second.", "CoverTitle")]
story.append(
    p(
        f"Warm and cold call notes for <b>Oran Colhoun</b>. The job of the call is to uncover one "
        f"commercial pressure point and earn the {red('next conversation')} - not to explain every feature.",
        "CoverSub",
    )
)
story.append(rule())
story.append(Spacer(1, 5 * mm))
story.append(
    box(
        "THE SIMPLE STORY",
        f"{red('COCOS')} goes into the kitchen, finds where time, stock, margin and control are being lost, "
        f"then helps the team <b>fix and install</b> the better way of working. {red('Flowdish')} keeps those "
        f"standards visible every day after the consultant leaves.",
        fill=RED_PALE,
        border=colors.HexColor("#F5B7B1"),
    )
)
story.append(Spacer(1, 4 * mm))
story.append(
    two_boxes(
        "WARM OPENER",
        f'"Hi [Name], {red("Oran Colhoun")} here from COCOS. [Person/context] suggested it would be useful to speak. '
        f'I work with commercial kitchens on {red("food cost, waste, systems and margin")}. Have you got two minutes?"',
        "COLD / PERMISSION OPENER",
        f'"Hi [Name], {red("Oran")} here. I am a chef and former operator. I help kitchens find where time, stock and '
        f'margin are leaking, then work with the team to fix it. Have I caught you with {red("30 seconds")}?"',
        fills=(TEAL_PALE, PALE),
    )
)
story.append(Spacer(1, 4 * mm))
story.append(
    two_boxes(
        "IF THEY SOUND BUSY",
        f'"No problem. Before I let you go - which is the bigger headache at the moment: {red("food cost, staff consistency, waste or paperwork")}?"',
        "IF THEY ASK WHAT COCOS DOES",
        f'"We {red("audit, fix, install and train")} - purchasing, recipe and menu costing, portion control, prep, stock, waste, SOPs and HACCP workflows. We can also develop or rewrite the menu."',
        fills=(PALE, TEAL_PALE),
    )
)
story.append(Spacer(1, 4 * mm))
story.append(
    box(
        "30-SECOND PITCH",
        f'"COCOS is hands-on kitchen operations consultancy. I look at what is actually happening in the kitchen, '
        f'not what the paperwork says should happen. We identify the biggest commercial leaks, build the fix and work '
        f'alongside the team to put it into service. Then, if it suits the business, {red("Flowdish becomes the continuous consultant")} - '
        f'live costs, stock, prep, waste, deliveries, SOPs and HACCP controls in one place."',
        fill=WHITE,
        border=RED,
        title_style="BoxTitle",
    )
)
story.append(Spacer(1, 4 * mm))
story.append(
    p(
        f"{red('CALL TARGET:')} Book a short discovery call or an operational review. Do not diagnose the whole kitchen on the phone.",
        "BodyCustom",
    )
)

# PAGE 2 - DISCOVERY FLOW
story.append(PageBreak())
story += section("Conversation flow", "Ask, listen, then take the right branch")
story.append(
    p(
        f"Start broad, then follow the pain. Use {red('one or two questions')} from each row - never interrogate.",
        "BodyCustom",
    )
)
story.append(Spacer(1, 2 * mm))
story.append(
    flow_table(
        [
            (
                f"Is food cost or gross margin where you want it?",
                f"Ask: {red('How current are recipe costs and portions?')} Route to cost control and menu engineering.",
                f"Ask: {red('How quickly would you spot supplier drift or waste?')} Test confidence with evidence.",
            ),
            (
                f"Does the kitchen run the same when the head chef is off?",
                f"Ask what is documented, trained and checked. Route to {red('SOPs, prep systems and accountability')}.",
                f"Position this as a strength. Ask whether growth or another site would expose any dependency.",
            ),
            (
                f"Are prep, ordering and waste recorded accurately?",
                f"Ask how long it takes and who checks it. Route to {red('workflow redesign + Flowdish')}.",
                f"Ask to see how numbers become decisions. Good records without action still leave leakage.",
            ),
            (
                f"Is the current menu delivering the margin and identity you need?",
                f"Route to {red('menu development, recipe costing and portion standards')}.",
                f"Keep menu writing secondary. Focus on systems, consistency and commercial visibility.",
            ),
            (
                f"Would the team use another system?",
                f"Ask what failed before. Lead with {red('hands-on installation, training and simple staff workflows')}.",
                f"Good. Show how Flowdish preserves the systems after COCOS leaves.",
            ),
            (
                f"Is there a clear problem worth exploring now?",
                f"Summarise it in their words and ask for the {red('next meeting')}.",
                f"Do not force it. Ask permission to follow up around their next menu, staffing or cost review.",
            ),
        ]
    )
)
story.append(Spacer(1, 5 * mm))
story.append(
    box(
        "THE BEST TRANSITION",
        f'"From what you have said, the issue is not [surface symptom]. It sounds more like {red("[repeat their actual problem]")}. '
        f'That is exactly the kind of thing I would look at in an operational review. Would it be useful to set aside 20 minutes and map it properly?"',
        fill=RED_PALE,
        border=RED,
    )
)

# PAGE 3 - COCOS
story.append(PageBreak())
story += section("Lead with the human", "COCOS: the consultant who installs the fix")
story.append(
    p(
        f"COCOS should feel like an experienced operator beside them, not a report arriving from outside. Use the "
        f"five-part sequence: {red('AUDIT -> FIX -> INSTALL -> TRAIN -> MAINTAIN')}.",
        "BodyCustom",
    )
)
story.append(Spacer(1, 2 * mm))

cocos_rows = [
    [p(red("AUDIT"), "TableBody"), p("Observe the live operation and find where time, stock and margin are being lost.", "TableBody")],
    [p(red("FIX"), "TableBody"), p("Build practical controls, workflows, menu costs, portions, SOPs and records around the real kitchen.", "TableBody")],
    [p(red("INSTALL"), "TableBody"), p("Work on site with management and the team so the solution survives a busy service.", "TableBody")],
    [p(red("TRAIN"), "TableBody"), p("Make responsibilities clear and give the team confidence to follow the new standard.", "TableBody")],
    [p(red("MAINTAIN"), "TableBody"), p("Review performance and use Flowdish where the business wants daily visibility and control.", "TableBody")],
]
cocos_table = Table(cocos_rows, colWidths=[31 * mm, 139 * mm], hAlign="LEFT")
cocos_table.setStyle(
    TableStyle(
        [
            ("GRID", (0, 0), (-1, -1), 0.5, LINE),
            ("ROWBACKGROUNDS", (0, 0), (-1, -1), [WHITE, PALE]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]
    )
)
story.append(cocos_table)
story.append(Spacer(1, 4 * mm))
story.append(p("Credibility - use only what helps the conversation", "H2Custom"))
story.append(
    two_boxes(
        "ORAN'S POSITIONING",
        f"{red('Chef-led. Former owner-operator. 18+ years in hospitality.')} Experience in Michelin-starred kitchens, restaurants, golf clubs, events and high-volume hospitality. Commercial and operational, not theoretical.",
        "WHAT THIS MEANS TO THEM",
        f"You understand the pass, the payroll, the supplier invoice and the owner conversation. The work is designed for {red('real shifts and real people')} - not ideal conditions.",
        fills=(TEAL_PALE, PALE),
    )
)
story.append(Spacer(1, 4 * mm))
story.append(p("Hooks to use when relevant", "H2Custom"))
for item in [
    f"{red('Margin:')} recipe and menu costing, purchasing, portion control and waste reduction.",
    f"{red('Menu:')} menu creation or redevelopment tied to cost, identity, execution and consistency.",
    f"{red('Operations:')} prep, stock movement, ordering, service flow and team responsibility.",
    f"{red('Standards:')} practical SOPs, training, HACCP workflows and repeatable checks.",
    f"{red('Growth:')} make the operation less dependent on one person before expansion or change.",
]:
    story.append(bullet(item))
story.append(Spacer(1, 3 * mm))
story.append(
    box(
        "DO NOT SAY",
        f"Avoid: <i>" + '"I will come in and tell your chef what is wrong."' + f"</i><br/>Say: <i>" + '"I will work with the people doing the job, establish what is really happening and build the fix with them."' + "</i>",
        fill=RED_PALE,
        border=colors.HexColor("#F5B7B1"),
    )
)

# PAGE 4 - FLOWDISH
story.append(PageBreak())
story += section("Then introduce the system", "Flowdish: the continuous consultant")
story.append(
    box(
        "THE HANDOVER LINE",
        f'"The consultancy makes the change humanly and operationally. {red("Flowdish helps the change stay made")} - '
        f'it keeps the costs, prep, stock, waste, deliveries, SOPs and HACCP routines visible after I leave."',
        fill=TEAL_PALE,
        border=TEAL,
    )
)
story.append(Spacer(1, 4 * mm))

flowdish_data = [
    [p("THEIR PAIN", "TableHead"), p("FLOWDISH PROOF POINT", "TableHead")],
    [p(red("Prices keep moving"), "TableBody"), p("Rapid supplier price updates, live recipe costs and visibility before drift reaches the menu.", "TableBody")],
    [p(red("Portions vary"), "TableBody"), p("Structured recipes, standard batch outputs and SOPs that can be read aloud during prep.", "TableBody")],
    [p(red("Over-ordering / expiry"), "TableBody"), p("Inventory lots, FIFO, expiry visibility and prep planning built around what is already on hand.", "TableBody")],
    [p(red("Dockets take too long"), "TableBody"), p("Reviewed AI-assisted docket reading can match SKUs, flag price/VAT issues and update inventory.", "TableBody")],
    [p(red("Waste is guessed"), "TableBody"), p("Voice-assisted waste entry, batch tracking and cost visibility make the loss measurable.", "TableBody")],
    [p(red("Staff avoid admin"), "TableBody"), p("Simple Staff PIN access, voice prep/waste drafts and points visibility reduce friction and support compliance.", "TableBody")],
    [p(red("HACCP lives on paper"), "TableBody"), p("Prep timepoints, delivery checks, refrigeration history, cold-storage graphs and accessible records.", "TableBody")],
    [p(red("Everything depends on one chef"), "TableBody"), p("Shared recipes, SOPs, prep plans and management visibility make standards easier to repeat.", "TableBody")],
]
flowdish_table = Table(flowdish_data, colWidths=[50 * mm, 120 * mm], repeatRows=1, hAlign="LEFT")
flowdish_table.setStyle(
    TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), INK),
            ("GRID", (0, 0), (-1, -1), 0.5, LINE),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, PALE]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]
    )
)
story.append(flowdish_table)
story.append(Spacer(1, 4 * mm))
story.append(
    box(
        "KEEP IT BELIEVABLE",
        f"Lead with the operational outcome, not the technology. Say {red('review before saving')} for AI-assisted imports. "
        f"Do not imply universal POS integration or that software replaces management judgement.",
        fill=RED_PALE,
        border=colors.HexColor("#F5B7B1"),
    )
)

# PAGE 5 - OBJECTIONS 1
story.append(PageBreak())
story += section("Push-back playbook", "Acknowledge first. Reframe second. Ask next.")
story.append(
    p(
        f"Never argue with the objection. Use: {red('"That makes sense"')} -> short reframe -> one relevant question.",
        "BodyCustom",
    )
)
story.append(Spacer(1, 2 * mm))
story.append(
    objection_table(
        [
            (
                "I'm already an expert chef. I don't need a consultant.",
                f'"I would expect you to know your kitchen. This is not about teaching an expert how to cook. It is about making your standards {red("visible, costed and repeatable")} when you are not standing there."',
                f'"What is the one part of the operation that still depends too heavily on you?"',
            ),
            (
                "The price is too high.",
                f'"Fair point - it has to pay back. The question is whether the recurring leakage in food cost, portions, waste or labour is {red("larger than the fix")}. We can start by sizing the opportunity before discussing a wider programme."',
                f'"Which cost line has moved most in the last six months?"',
            ),
            (
                "I don't have time for this.",
                f'"I understand. Usually that is a sign the kitchen is carrying too much through memory, workarounds and rework. The purpose is to {red("give time back")}, and I work alongside the team rather than handing you homework."',
                f'"Where does management time disappear most often?"',
            ),
            (
                "My staff won't use software.",
                f'"Software alone will not fix that. COCOS installs the workflow with the people using it. Flowdish keeps staff tasks narrow - PIN access, simple checks and voice-assisted prep or waste drafts. {red("Adoption is part of the implementation.")}"',
                f'"What did staff reject the last time you introduced a system?"',
            ),
            (
                "We already use spreadsheets / another system.",
                f'"That may already cover part of the job. I am interested in the gap between the data and the shift: are prices current, are portions followed, and does waste change a decision? {red("We do not replace useful tools for the sake of it.")}"',
                f'"What still has to be copied, chased or checked manually?"',
            ),
            (
                "The business is doing fine.",
                f'"Good - this is not only for distressed kitchens. Strong businesses use the work to prepare for growth, protect margin and reduce dependence on key people. {red("Control is easiest to build before a crisis.")}"',
                f'"If you opened another site, what would be hardest to reproduce?"',
            ),
        ]
    )
)

# PAGE 6 - OBJECTIONS 2 + CLOSES
story.append(PageBreak())
story += section("More push-back and closes", "Make the next step small and specific")
story.append(
    objection_table(
        [
            (
                "Just send me information.",
                f'"Absolutely. I do not want to send you a generic brochure. If you give me one issue, I will send the {red("relevant piece")} and we can decide whether a short call is worthwhile."',
                f'"Is the priority margin, waste, systems, menu or HACCP?"',
            ),
            (
                "We tried consultants before. Nothing changed.",
                f'"That is exactly why COCOS is hands-on. The engagement can include {red("implementation and team training")}, not just a report for management to interpret."',
                f'"What stopped the previous recommendations becoming normal practice?"',
            ),
            (
                "I don't want someone criticising my chef.",
                f'"Neither do I. The chef and team hold the operational knowledge. My role is to observe, test the commercial picture and {red("build the solution with them")}, not score points from the sidelines."',
                f'"Would it help if the chef were part of the first conversation?"',
            ),
            (
                "We cannot handle major change right now.",
                f'"Then we should not force major change. We can identify the highest-value pressure point and {red("stage the work")}. One working control is better than ten unfinished initiatives."',
                f'"What is the smallest change that would make next month easier?"',
            ),
            (
                "Do we have to use Flowdish?",
                f'"No. The consultancy stands on its own. Flowdish is the option for keeping the new standards visible in one operational platform after the consultancy."',
                f'"Would you prefer to discuss the operational issue first and leave software out for now?"',
            ),
            (
                "Our HACCP is already covered.",
                f'"Good. HACCP training is a separate service anyway. We can focus entirely on {red("margin, stock, prep, waste, menu and team systems")} if that is where the value sits."',
                f'"Which commercial control gets the least attention during service?"',
            ),
        ]
    )
)
story.append(Spacer(1, 4 * mm))
story.append(p("Close options", "H2Custom"))
story.append(
    two_boxes(
        "DIRECT CLOSE",
        f'"There is enough there to justify a proper look. Shall we book {red("20 minutes")}, include [chef/GM/owner], and map the issue before deciding anything else?"',
        "LOW-FRICTION CLOSE",
        f'"I will send the short overview on [their issue]. Can we put a {red("10-minute follow-up")} in the diary now so it does not disappear into the inbox?"',
        fills=(TEAL_PALE, PALE),
    )
)
story.append(Spacer(1, 4 * mm))
story.append(
    box(
        "IF THE ANSWER IS NO",
        f'"Understood. I will leave it there. Would it be all right if I check back around your next {red("menu review, budget cycle or busy-season debrief")}?"<br/><br/>'
        f"Log the reason, the trigger and a sensible follow-up date. A respectful no is better than a damaged relationship.",
        fill=RED_PALE,
        border=RED,
    )
)

# PAGE 7 - FINAL DESK CARD
story.append(PageBreak())
story += section("One-page memory card", "What to remember while the phone is ringing")
story.append(
    box(
        "1. OPEN",
        f"Name the connection or ask for {red('30 seconds')}. Sound like a chef/operator, not a software salesperson.",
        fill=PALE,
    )
)
story.append(Spacer(1, 3 * mm))
story.append(
    box(
        "2. FIND ONE PAIN",
        f"Choose from {red('margin - prices - portions - prep - stock - waste - people - HACCP - menu')}. Ask for a recent example.",
        fill=WHITE,
    )
)
story.append(Spacer(1, 3 * mm))
story.append(
    box(
        "3. POSITION COCOS",
        f"{red('Audit -> fix -> install -> train -> maintain.') } Hands-on operational change, built with the people doing the work.",
        fill=RED_PALE,
        border=colors.HexColor("#F5B7B1"),
    )
)
story.append(Spacer(1, 3 * mm))
story.append(
    box(
        "4. INTRODUCE FLOWDISH ONLY WHEN RELEVANT",
        f"{red('The consultant can leave. The system should not.')} Flowdish keeps the improved routines, costs and checks visible.",
        fill=TEAL_PALE,
        border=TEAL,
    )
)
story.append(Spacer(1, 3 * mm))
story.append(
    box(
        "5. CLOSE",
        f"Repeat their problem in their words. Ask for a {red('short discovery call or operational review')}. Agree the people, date and purpose.",
        fill=WHITE,
    )
)
story.append(Spacer(1, 5 * mm))
story.append(p("Five lines worth remembering", "H2Custom"))
for item in [
    f'"The goal is not more paperwork. It is a {red("better-run kitchen")}."',
    f'"I look at what is actually happening, not only what the system says should happen."',
    f'"You know your kitchen. I bring an outside operator lens and the time to build the fix."',
    f'"Consultancy fixes the operation. {red("Flowdish helps keep it fixed")}."',
    f'"Let us size the opportunity before we discuss a wider programme."',
]:
    story.append(bullet(item))
story.append(Spacer(1, 6 * mm))
story.append(rule())
story.append(Spacer(1, 4 * mm))
story.append(
    p(
        "Prepared from the current public positioning on cocos.ie and the Flowdish operating workflow. "
        "Internal use only. Tailor examples to the prospect and never promise a feature or outcome that has not been scoped.",
        "SmallCustom",
    )
)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
doc.build(story)
print(OUTPUT)
