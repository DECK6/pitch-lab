from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


OUTPUT = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "scores" / "printed-satb.pdf"


def draw_staff(page: canvas.Canvas, label: str, bottom: float, steps: list[int]) -> None:
    left = 78
    right = 534
    spacing = 12
    page.setStrokeColorRGB(0, 0, 0)
    page.setFillColorRGB(0, 0, 0)
    page.setLineWidth(1.15)
    for line in range(5):
        y = bottom + line * spacing
        page.line(left, y, right, y)
    for x in (left, 306, right):
        page.line(x, bottom, x, bottom + spacing * 4)
    page.setFont("Helvetica-Bold", 10)
    page.drawString(34, bottom + spacing * 1.7, label)
    for x, step in zip((145, 252, 365, 472), steps, strict=True):
        y = bottom + step * spacing / 2
        page.ellipse(x - 6.5, y - 4.7, x + 6.5, y + 4.7, fill=1, stroke=0)
        page.setLineWidth(1.5)
        page.line(x + 6, y, x + 6, y + 31)


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    page = canvas.Canvas(str(OUTPUT), pagesize=letter, pageCompression=1)
    page.setTitle("Pitch Lab SATB printed fixture")
    page.setFont("Helvetica-Bold", 16)
    page.drawString(78, 748, "PITCH LAB / PRINTED SATB FIXTURE")
    page.setFont("Helvetica", 9)
    page.drawString(78, 729, "Clean five-line staff and filled-note fixture for local PDF recognition QA")
    draw_staff(page, "S", 618, [4, 5, 6, 7])
    draw_staff(page, "A", 478, [1, 2, 3, 4])
    draw_staff(page, "T", 338, [3, 2, 1, 0])
    draw_staff(page, "B", 198, [0, -1, -2, -3])
    page.showPage()
    page.save()
    print(OUTPUT)


if __name__ == "__main__":
    main()
