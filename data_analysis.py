"""
User-study data analysis
Enhancing Intuitive Risk Comprehension Through Auditory Cues in Fault Trees

This script reproduces the quantitative analyses reported in the Evaluation
chapter and limitations section of the thesis.

Design
------
- Within-subjects comparison: each participant used both versions.
- Between-subjects order factor: AV-first vs VO-first.
- N = 10 participants.
- Main outcome: five-item Intuition Score per condition, on a 1-5 scale.

Analyses
--------
- Descriptive statistics and per-participant condition differences.
- Cronbach's alpha for the five-item intuition scale.
- Wilcoxon signed-rank test as the primary paired non-parametric test.
- Paired t-test as a parametric concordance check.
- 2 x 2 mixed ANOVA: Condition (AV/VO) x Order (AV-first/VO-first).
- Exact binomial and Fisher's exact tests for preference/order checks.
- Power-based sample size context for the observed paired effect.

The formulas are implemented directly in standard Python so the file remains
fully reproducible without installing third-party packages. The reported tests
are standard inferential methods; the conclusions are framed as exploratory
because the study is underpowered.

Run:
    python3 data_analysis.py
"""

from collections import Counter, defaultdict
from itertools import product
from math import comb, erf, exp, lgamma, log, sqrt
from statistics import mean, median, stdev


# ---------------------------------------------------------------------------
# 1. RAW DATA
# ---------------------------------------------------------------------------
PARTICIPANTS = {
    "P01": dict(order="AVfirst", AV=[4, 3, 4, 3, 4], VO=[5, 3, 5, 3, 4], choice="AV"),
    "P02": dict(order="VOfirst", VO=[5, 2, 2, 4, 5], AV=[5, 4, 5, 5, 5], choice="AV"),
    "P03": dict(order="AVfirst", AV=[5, 3, 4, 2, 4], VO=[5, 5, 5, 5, 5], choice="VO"),
    "P04": dict(order="AVfirst", AV=[3, 4, 3, 2, 3], VO=[2, 4, 3, 4, 2], choice="AV"),
    "P05": dict(order="VOfirst", VO=[5, 3, 3, 4, 5], AV=[5, 5, 4, 4, 4], choice="AV"),
    "P06": dict(order="VOfirst", VO=[2, 2, 2, 3, 2], AV=[5, 2, 3, 4, 3], choice="AV"),
    "P07": dict(order="AVfirst", AV=[3, 3, 2, 4, 4], VO=[2, 2, 4, 4, 3], choice="AV"),
    "P08": dict(order="VOfirst", VO=[2, 3, 4, 2, 3], AV=[1, 3, 2, 2, 4], choice="VO"),
    "P09": dict(order="VOfirst", VO=[5, 3, 4, 2, 3], AV=[5, 4, 4, 5, 4], choice="AV"),
    "P10": dict(order="AVfirst", AV=[4, 4, 4, 4, 3], VO=[3, 4, 2, 3, 3], choice="AV"),
}

DIRECT_COMPARISON = [
    dict(item="D1", prompt="Risk felt more immediate", AV=5, VO=3, same_none=2),
    dict(item="D2", prompt="Understanding was easier", AV=7, VO=2, same_none=1),
    dict(item="D3", prompt="Trusted more for quick risk judgement", AV=8, VO=2, same_none=0),
    dict(item="D4", prompt="Sound helped intuitive risk sensing", yes=7, harder=2, missing=1),
]

THEMES = [
    ("Sound creates alertness and felt tension", 8),
    ('The "click" moment is multimodal: sound and red together', 7),
    ("The audio intensity becomes uncomfortable", 7),
    ("Sound-to-component mapping is unclear", 3),
]


# ---------------------------------------------------------------------------
# 2. NUMERICAL HELPERS
# ---------------------------------------------------------------------------
def normal_cdf(x):
    return 0.5 * (1 + erf(x / sqrt(2)))


def inverse_normal_cdf(p):
    """Acklam's rational approximation for the standard normal quantile."""
    if not 0 < p < 1:
        raise ValueError("p must be between 0 and 1")

    a = [
        -3.969683028665376e01,
        2.209460984245205e02,
        -2.759285104469687e02,
        1.383577518672690e02,
        -3.066479806614716e01,
        2.506628277459239e00,
    ]
    b = [
        -5.447609879822406e01,
        1.615858368580409e02,
        -1.556989798598866e02,
        6.680131188771972e01,
        -1.328068155288572e01,
    ]
    c = [
        -7.784894002430293e-03,
        -3.223964580411365e-01,
        -2.400758277161838e00,
        -2.549732539343734e00,
        4.374664141464968e00,
        2.938163982698783e00,
    ]
    d = [
        7.784695709041462e-03,
        3.224671290700398e-01,
        2.445134137142996e00,
        3.754408661907416e00,
    ]
    p_low = 0.02425
    p_high = 1 - p_low

    if p < p_low:
        q = sqrt(-2 * log(p))
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / (
            (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1
        )
    if p <= p_high:
        q = p - 0.5
        r = q * q
        return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (
            ((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1
        )

    q = sqrt(-2 * log(1 - p))
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / (
        (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1
    )


def beta_continued_fraction(a, b, x):
    """Continued fraction used for the regularized incomplete beta function."""
    max_iter = 200
    eps = 3e-12
    tiny = 1e-300

    qab = a + b
    qap = a + 1
    qam = a - 1
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < tiny:
        d = tiny
    d = 1.0 / d
    h = d

    for m in range(1, max_iter + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < tiny:
            d = tiny
        c = 1.0 + aa / c
        if abs(c) < tiny:
            c = tiny
        d = 1.0 / d
        h *= d * c

        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < tiny:
            d = tiny
        c = 1.0 + aa / c
        if abs(c) < tiny:
            c = tiny
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < eps:
            break

    return h


def regularized_beta(x, a, b):
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0

    log_bt = lgamma(a + b) - lgamma(a) - lgamma(b) + a * log(x) + b * log(1 - x)
    bt = exp(log_bt)

    if x < (a + 1) / (a + b + 2):
        return bt * beta_continued_fraction(a, b, x) / a
    return 1 - bt * beta_continued_fraction(b, a, 1 - x) / b


def t_two_sided_p(t_stat, df):
    x = df / (df + t_stat * t_stat)
    return regularized_beta(x, df / 2, 0.5)


def f_survival_p(f_stat, df1, df2):
    x = df2 / (df2 + df1 * f_stat)
    return regularized_beta(x, df2 / 2, df1 / 2)


def t_critical_approx(p, df):
    """Cornish-Fisher approximation to the Student-t quantile."""
    z = inverse_normal_cdf(p)
    return (
        z
        + (z**3 + z) / (4 * df)
        + (5 * z**5 + 16 * z**3 + 3 * z) / (96 * df**2)
        + (3 * z**7 + 19 * z**5 + 17 * z**3 - 15 * z) / (384 * df**3)
    )


def rank_average(values):
    ordered = sorted((value, index) for index, value in enumerate(values))
    ranks = [0.0] * len(values)
    i = 0
    while i < len(ordered):
        j = i
        while j < len(ordered) and ordered[j][0] == ordered[i][0]:
            j += 1
        avg_rank = (i + 1 + j) / 2
        for _, index in ordered[i:j]:
            ranks[index] = avg_rank
        i = j
    return ranks


# ---------------------------------------------------------------------------
# 3. STATISTICAL TESTS
# ---------------------------------------------------------------------------
def cronbach_alpha(rows):
    k = len(rows[0])
    columns = list(zip(*rows))
    item_variance = sum(stdev(col) ** 2 for col in columns)
    total_scores = [sum(row) for row in rows]
    total_variance = stdev(total_scores) ** 2
    return k / (k - 1) * (1 - item_variance / total_variance)


def wilcoxon_signed_rank(differences):
    nonzero = [d for d in differences if d != 0]
    abs_values = [abs(d) for d in nonzero]
    ranks = rank_average(abs_values)

    w_pos = sum(rank for rank, d in zip(ranks, nonzero) if d > 0)
    w_neg = sum(rank for rank, d in zip(ranks, nonzero) if d < 0)
    w_stat = min(w_pos, w_neg)

    n = len(nonzero)
    expected = n * (n + 1) / 4
    counts = Counter(abs_values)
    tie_correction = sum(count**3 - count for count in counts.values())
    variance = (n * (n + 1) * (2 * n + 1) - tie_correction / 2) / 24
    z = (w_stat - expected) / sqrt(variance)
    p_normal = 2 * (1 - normal_cdf(abs(z)))

    # Exact sign enumeration over the observed average ranks. This is included
    # as a sensitivity check; the thesis reports the normal approximation.
    possible_w = []
    for signs in product([0, 1], repeat=n):
        possible_w.append(sum(rank for rank, sign in zip(ranks, signs) if sign))
    lower_tail = sum(w <= w_stat + 1e-12 for w in possible_w) / len(possible_w)
    p_exact = min(1.0, 2 * lower_tail)

    return dict(
        n=n,
        w_pos=w_pos,
        w_neg=w_neg,
        w_stat=w_stat,
        z=abs(z),
        p_normal=p_normal,
        p_exact=p_exact,
    )


def paired_t_test(differences):
    n = len(differences)
    m = mean(differences)
    sd = stdev(differences)
    t_stat = m / (sd / sqrt(n))
    p = t_two_sided_p(abs(t_stat), n - 1)
    dz = m / sd
    return dict(n=n, df=n - 1, t=t_stat, p=p, dz=dz)


def mixed_anova():
    rows = []
    for pid, data in PARTICIPANTS.items():
        rows.append(dict(pid=pid, order=data["order"], condition="AV", score=data["AVm"]))
        rows.append(dict(pid=pid, order=data["order"], condition="VO", score=data["VOm"]))

    groups = sorted({row["order"] for row in rows})
    conditions = ["AV", "VO"]
    subjects = list(PARTICIPANTS)
    n_per_group = len(subjects) // len(groups)
    a = len(groups)
    b = len(conditions)

    all_scores = [row["score"] for row in rows]
    grand = mean(all_scores)
    subject_mean = {
        pid: mean(row["score"] for row in rows if row["pid"] == pid)
        for pid in subjects
    }
    group_mean = {
        group: mean(row["score"] for row in rows if row["order"] == group)
        for group in groups
    }
    condition_mean = {
        condition: mean(row["score"] for row in rows if row["condition"] == condition)
        for condition in conditions
    }
    cell_mean = {
        (group, condition): mean(
            row["score"]
            for row in rows
            if row["order"] == group and row["condition"] == condition
        )
        for group in groups
        for condition in conditions
    }

    ss_between = b * sum((subject_mean[pid] - grand) ** 2 for pid in subjects)
    ss_order = b * n_per_group * sum((group_mean[group] - grand) ** 2 for group in groups)
    ss_subject_order = ss_between - ss_order

    ss_within = sum((row["score"] - subject_mean[row["pid"]]) ** 2 for row in rows)
    ss_condition = a * n_per_group * sum(
        (condition_mean[condition] - grand) ** 2 for condition in conditions
    )
    ss_interaction = n_per_group * sum(
        (
            cell_mean[(group, condition)]
            - group_mean[group]
            - condition_mean[condition]
            + grand
        )
        ** 2
        for group in groups
        for condition in conditions
    )
    ss_error = ss_within - ss_condition - ss_interaction

    df_order = a - 1
    df_subject_order = len(subjects) - a
    df_condition = b - 1
    df_interaction = (a - 1) * (b - 1)
    df_error = (len(subjects) - a) * (b - 1)

    def row(name, ss, df1, ss_err, df2):
        ms = ss / df1
        ms_err = ss_err / df2
        f_stat = ms / ms_err
        p = f_survival_p(f_stat, df1, df2)
        eta = ss / (ss + ss_err)
        return dict(source=name, ss=ss, df1=df1, df2=df2, f=f_stat, p=p, np2=eta)

    return [
        row("Order", ss_order, df_order, ss_subject_order, df_subject_order),
        row("Condition", ss_condition, df_condition, ss_error, df_error),
        row("Condition x Order", ss_interaction, df_interaction, ss_error, df_error),
    ]


def binomial_two_sided(k, n, p0=0.5):
    observed_prob = comb(n, k) * p0**k * (1 - p0) ** (n - k)
    total = 0.0
    for x in range(n + 1):
        prob = comb(n, x) * p0**x * (1 - p0) ** (n - x)
        if prob <= observed_prob + 1e-12:
            total += prob
    return min(1.0, total)


def hypergeom_probability(a, row1, col1, total):
    return comb(col1, a) * comb(total - col1, row1 - a) / comb(total, row1)


def fisher_exact_two_sided(table):
    a, b = table[0]
    c, d = table[1]
    row1 = a + b
    row2 = c + d
    col1 = a + c
    total = row1 + row2
    observed = hypergeom_probability(a, row1, col1, total)

    min_a = max(0, row1 - (total - col1))
    max_a = min(row1, col1)
    p = 0.0
    for candidate_a in range(min_a, max_a + 1):
        prob = hypergeom_probability(candidate_a, row1, col1, total)
        if prob <= observed + 1e-12:
            p += prob
    return min(1.0, p)


def approximate_power(effect_size, n, alpha=0.05):
    df = n - 1
    ncp = abs(effect_size) * sqrt(n)
    tcrit = t_critical_approx(1 - alpha / 2, df)
    return 1 - normal_cdf(tcrit - ncp) + normal_cdf(-tcrit - ncp)


def required_n_for_power(effect_size, target_power=0.80, alpha=0.05):
    for n in range(2, 1000):
        if approximate_power(effect_size, n, alpha) >= target_power:
            return n
    raise RuntimeError("Required N exceeds search range")


# ---------------------------------------------------------------------------
# 4. PRINTED REPORT
# ---------------------------------------------------------------------------
def participant_scores():
    for data in PARTICIPANTS.values():
        data["AVm"] = mean(data["AV"])
        data["VOm"] = mean(data["VO"])
        data["diff"] = round(data["AVm"] - data["VOm"], 6)
        data["first"] = data["AVm"] if data["order"] == "AVfirst" else data["VOm"]
        data["second"] = data["VOm"] if data["order"] == "AVfirst" else data["AVm"]


def print_participant_table():
    print("=" * 78)
    print("TABLE 8-2: PER-PARTICIPANT INTUITION SCORES")
    print("=" * 78)
    print(f"{'ID':<5}{'order':<9}{'VO':>7}{'AV':>7}{'AV-VO':>9}{'higher':>14}{'D3 choice':>12}")
    for pid, data in PARTICIPANTS.items():
        if data["diff"] > 0:
            higher = "AV"
        elif data["diff"] < 0:
            higher = "VO"
        else:
            higher = "Equal"
        print(
            f"{pid:<5}{data['order']:<9}{data['VOm']:>7.2f}{data['AVm']:>7.2f}"
            f"{data['diff']:>+9.2f}{higher:>14}{data['choice']:>12}"
        )


def print_descriptives(av_scores, vo_scores):
    print("\n" + "=" * 78)
    print("TABLE 8-3: DESCRIPTIVE STATISTICS")
    print("=" * 78)
    print(f"{'Condition':<16}{'Mean':>8}{'Median':>10}{'SD':>8}{'Range':>14}")
    for label, scores in [("Visual-only", vo_scores), ("Audiovisual", av_scores)]:
        print(
            f"{label:<16}{mean(scores):>8.2f}{median(scores):>10.2f}"
            f"{stdev(scores):>8.2f}{min(scores):>6.2f}-{max(scores):<5.2f}"
        )
    print(f"{'Difference':<16}{mean(av_scores) - mean(vo_scores):>+8.2f}{median(av_scores) - median(vo_scores):>+10.2f}")


def print_reliability():
    av_alpha = cronbach_alpha([data["AV"] for data in PARTICIPANTS.values()])
    vo_alpha = cronbach_alpha([data["VO"] for data in PARTICIPANTS.values()])
    pooled_alpha = cronbach_alpha(
        [data["AV"] for data in PARTICIPANTS.values()]
        + [data["VO"] for data in PARTICIPANTS.values()]
    )

    print("\n" + "=" * 78)
    print("SCALE RELIABILITY: CRONBACH'S ALPHA")
    print("=" * 78)
    print(f"Audiovisual alpha: {av_alpha:.2f}")
    print(f"Visual-only alpha: {vo_alpha:.2f}")
    print(f"Pooled administrations alpha: {pooled_alpha:.2f}")


def print_condition_tests(differences):
    wilcoxon = wilcoxon_signed_rank(differences)
    ttest = paired_t_test(differences)
    higher_av = sum(d > 0 for d in differences)
    higher_vo = sum(d < 0 for d in differences)
    equal = sum(d == 0 for d in differences)

    print("\n" + "=" * 78)
    print("PRIMARY CONDITION TEST: AV VS VO")
    print("=" * 78)
    print(f"Higher AV: {higher_av}/10   Higher VO: {higher_vo}/10   Equal: {equal}/10")
    print(
        f"Wilcoxon signed-rank: W+ = {wilcoxon['w_pos']:.0f}, "
        f"W- = {wilcoxon['w_neg']:.0f}, W = {wilcoxon['w_stat']:.0f}, "
        f"n(non-tied) = {wilcoxon['n']}"
    )
    print(f"  tie-corrected normal approximation: z = {wilcoxon['z']:.2f}, p = {wilcoxon['p_normal']:.2f}")
    print(f"  exact sign-enumeration sensitivity check: p = {wilcoxon['p_exact']:.2f}")
    print(
        f"Paired t-test concordance check: t({ttest['df']}) = {ttest['t']:.2f}, "
        f"p = {ttest['p']:.2f}, Cohen's dz = {ttest['dz']:.2f}"
    )


def print_mixed_anova():
    print("\n" + "=" * 78)
    print("2 x 2 MIXED ANOVA: CONDITION (AV/VO) x ORDER (AV-FIRST/VO-FIRST)")
    print("=" * 78)
    print(f"{'Source':<20}{'SS':>8}{'df1':>6}{'df2':>6}{'F':>8}{'p':>8}{'partial eta2':>15}")
    for row in mixed_anova():
        print(
            f"{row['source']:<20}{row['ss']:>8.3f}{row['df1']:>6}"
            f"{row['df2']:>6}{row['f']:>8.2f}{row['p']:>8.2f}{row['np2']:>15.2f}"
        )


def print_direct_comparison():
    print("\n" + "=" * 78)
    print("DIRECT COMPARISON AND PREFERENCE CHECKS")
    print("=" * 78)
    for row in DIRECT_COMPARISON:
        if row["item"] == "D4":
            print(
                f"{row['item']}: {row['yes']} yes, {row['harder']} harder, "
                f"{row['missing']} missing"
            )
        else:
            print(
                f"{row['item']}: AV={row['AV']}, VO={row['VO']}, "
                f"same/none={row['same_none']}  ({row['prompt']})"
            )

    n_av = sum(data["choice"] == "AV" for data in PARTICIPANTS.values())
    binom_p = binomial_two_sided(n_av, len(PARTICIPANTS))
    by_order = defaultdict(Counter)
    for data in PARTICIPANTS.values():
        by_order[data["order"]][data["choice"]] += 1
    table = [
        [by_order["AVfirst"]["AV"], by_order["AVfirst"]["VO"]],
        [by_order["VOfirst"]["AV"], by_order["VOfirst"]["VO"]],
    ]
    fisher_p = fisher_exact_two_sided(table)
    print(f"D3 overall AV preference: {n_av}/10, exact binomial p = {binom_p:.2f}")
    print(f"Starting order vs D3 choice table: {table}, Fisher's exact p = {fisher_p:.2f}")


def print_order_summary():
    by_order = defaultdict(list)
    for data in PARTICIPANTS.values():
        by_order[data["order"]].append(data["diff"])

    second_higher = sum(data["second"] > data["first"] for data in PARTICIPANTS.values())
    first_scores = [data["first"] for data in PARTICIPANTS.values()]
    second_scores = [data["second"] for data in PARTICIPANTS.values()]

    print("\n" + "=" * 78)
    print("ORDER / RECENCY DESCRIPTIVE CHECK")
    print("=" * 78)
    print(f"Mean AV-VO diff, AV-first group: {mean(by_order['AVfirst']):+.2f}")
    print(f"Mean AV-VO diff, VO-first group: {mean(by_order['VOfirst']):+.2f}")
    print(
        f"First version mean = {mean(first_scores):.2f}; "
        f"second version mean = {mean(second_scores):.2f}; "
        f"second rated higher by {second_higher}/10"
    )


def print_themes():
    print("\n" + "=" * 78)
    print("TABLE 8-5: OPEN-RESPONSE THEMES")
    print("=" * 78)
    for theme, count in THEMES:
        print(f"{count}/10 - {theme}")


def print_power(differences):
    ttest = paired_t_test(differences)
    observed_dz = abs(ttest["dz"])
    observed_n = required_n_for_power(observed_dz)
    medium_n = required_n_for_power(0.50)
    large_n = required_n_for_power(0.80)

    print("\n" + "=" * 78)
    print("RETROSPECTIVE POWER / SENSITIVITY ESTIMATE")
    print("=" * 78)
    print(f"Observed paired effect: Cohen's dz = {ttest['dz']:.2f}")
    print(f"N required for observed effect at 80% power, alpha=.05: {observed_n}")
    print(f"N required for medium effect (dz=.50) at 80% power: {medium_n}")
    print(f"N required for large effect (dz=.80) at 80% power: {large_n}")


def main():
    participant_scores()
    av_scores = [data["AVm"] for data in PARTICIPANTS.values()]
    vo_scores = [data["VOm"] for data in PARTICIPANTS.values()]
    differences = [data["diff"] for data in PARTICIPANTS.values()]

    print_participant_table()
    print_descriptives(av_scores, vo_scores)
    print_reliability()
    print_condition_tests(differences)
    print_mixed_anova()
    print_direct_comparison()
    print_order_summary()
    print_themes()
    print_power(differences)

    print("\nAll analyses complete. Interpret inferential results as exploratory because N = 10.")


if __name__ == "__main__":
    main()
