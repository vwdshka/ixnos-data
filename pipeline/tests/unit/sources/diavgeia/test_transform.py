import gzip
import json
from pathlib import Path

from ixnos_data_pipeline.sources.diavgeia.transform import transform

DECISION = {
    "ada": "ΛΚΧ146Ψ8Ν2-1ΗΔ",
    "subject": "Πληρωμή  προμήθειας ειδών",
    "decisionTypeId": "Β.2.2",
    "organizationId": "99221070",
    "issueDate": 1789000000000,
    "submissionTimestamp": 1789100000000,
    "status": "PUBLISHED",
    "extraFieldValues": {
        "org": {"afm": "090012726", "name": "ΝΟΣΟΚΟΜΕΙΟ"},
        "sponsor": [
            {
                "sponsorAFMName": {"afm": "094014201", "name": "ΠΡΟΜΗΘΕΥΤΗΣ Α.Ε."},
                "expenseAmount": {"amount": 100.0},
            },
            {
                "sponsorAFMName": {"afm": "094014201", "name": "ΠΡΟΜΗΘΕΥΤΗΣ Α.Ε."},
                "expenseAmount": {"amount": 23.5},
            },
            {"expenseAmount": {"amount": 50.0}},
        ],
        "relatedEkgrisiDapanis": [{"textRelatedADA": "6ΑΘ646ΜΖΜ4-Κ6Ψ"}],
        "relatedDecisions": [{"relatedDecisionsADA": "00000-000"}],
    },
}


def test_payment() -> None:
    bundle = transform(DECISION)
    item = bundle.item

    assert (item["source"], item["source_id"], item["kind"]) == (
        "diavgeia",
        "ΛΚΧ146Ψ8Ν2-1ΗΔ",
        "payment",
    )
    assert item["title"] == "Πληρωμή προμήθειας ειδών"
    # Διαύγεια amounts include VAT and stay out of amount_eur (see the module docstring).
    assert item["amount_eur"] is None
    assert item["amount_with_vat_eur"] == 173.5
    # Two budget lines of one payee merge; the withheld payee is skipped.
    [payee] = bundle.contractors
    assert (payee.tax_id, payee.role, payee.amount_eur) == ("094014201", "payee", 123.5)
    # Placeholder ΑΔΑ are not links.
    assert [(link.relation, link.to_source_id) for link in bundle.links] == [
        ("spending_approval", "6ΑΘ646ΜΖΜ4-Κ6Ψ")
    ]


def test_award_names_individuals_without_fathers_name() -> None:
    award = DECISION | {
        "decisionTypeId": "Δ.1",
        "extraFieldValues": {
            "person": [{"afm": "037877118", "name": "ΠΑΠΑΔΟΠΟΥΛΟΣ,,ΔΗΜΗΤΡΙΟΣ,ΚΙΜΩΝ"}],
            "awardAmount": {"amount": 595.2},
            "cpv": ["79540000-1"],
        },
    }
    bundle = transform(award)

    assert bundle.item["kind"] == "award"
    assert bundle.item["cpv_codes"] == ["79540000-1"]
    assert [(c.name, c.role) for c in bundle.contractors] == [("ΠΑΠΑΔΟΠΟΥΛΟΣ ΔΗΜΗΤΡΙΟΣ", "winner")]


def test_every_probe_decision_transforms_when_the_probe_exists() -> None:
    # Local-only check against the real probe cache (git-ignored); skipped in CI.
    root = Path(__file__).parents[5] / ".data" / "diavgeia-probe" / "raw"
    pages = sorted(root.glob("*/*/page-0000.json.gz"))[:20]
    for page in pages:
        for raw in json.loads(gzip.decompress(page.read_bytes()))["decisions"]:
            transform(raw)
