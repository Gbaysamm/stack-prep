"""LaTeX said the way a teacher at the board would say it."""

from app.spoken_maths import speak, speak_text


def test_degrees_are_not_a_power() -> None:
    assert speak(r"60^{\circ}") == "60 degrees"


def test_small_fractions_are_words_and_others_read_over() -> None:
    assert speak(r"\dfrac{3}{4}") == "three quarters"
    assert speak(r"\tfrac{1}{2}") == "a half"
    assert speak(r"\dfrac{7}{36}") == "7 over 36"
    # "nine halves" is correct English that no student listening for the numbers follows
    assert speak(r"\dfrac{9}{2}") == "9 over 2"
    assert speak(r"\tfrac{4}{3}") == "4 over 3"
    assert speak(r"\dfrac{2}{3}") == "two thirds"
    assert speak(r"2\tfrac{1}{2}") == "2 and a half"


def test_a_long_fraction_pauses_so_it_is_not_misheard() -> None:
    assert speak(r"\dfrac{x + 1}{x - 1}") == "x plus 1, all over x minus 1"


def test_roots() -> None:
    assert speak(r"\sqrt{\dfrac{3}{4}}") == "the square root of three quarters"
    assert speak(r"\sqrt[3]{8}") == "the cube root of 8"
    assert speak(r"2\sqrt{3}") == "2 root 3"


def test_a_bracket_doing_work_is_said() -> None:
    assert speak(r"3p - (q - 3r)") == "3 p minus the bracket q minus 3 r"
    assert speak(r"(x + 1)(x - 2)") == "the bracket x plus 1, times the bracket x minus 2"
    assert speak(r"f(-1)") == "f of minus 1"
    assert speak(r"(2, 0)") == "2 comma 0"


def test_logs_trig_and_calculus() -> None:
    assert speak(r"\log_{2} 8") == "log base 2 of 8"
    assert speak(r"\sin^{2}\theta") == "sine squared theta"
    assert speak(r"\int_{0}^{1} x\,dx") == "the integral from 0 to 1 of x d x"


def test_sets_units_and_between() -> None:
    assert speak(r"n(A \cup B)") == "n of A union B"
    assert speak(r"5\text{ cm}") == "5 centimetres"
    assert speak(r"-2 < x < 3") == "x is between minus 2 and 3"


def test_a_matrix_says_its_rows() -> None:
    assert speak(r"\begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}") == (
        "the matrix with rows 1, 2; 3, 4"
    )


def test_a_sentence_keeps_its_words_and_loses_screen_marks() -> None:
    assert speak_text(r"So $x = 3$ ✓ and it costs ₦5,000.") == (
        "So x equals 3 and it costs 5,000 naira."
    )
    assert speak_text(r"It costs $₦26{,}400$ in all.") == "It costs 26,400 naira in all."
    assert speak_text("A *key* idea.") == "A key idea."


def test_chemistry_formulae_are_spelled_a_symbol_at_a_time() -> None:
    assert speak(r"\ce{H2SO4}") == "H 2 S O 4"
    assert speak(r"\ce{CuSO4.5H2O}") == "C U S O 4 dot 5 H 2 O"
    assert speak(r"\ce{Ca(NO3)2}") == "C A N O 3 twice"
    assert speak(r"\ce{NaCl(aq)}") == "N A C L aqueous"


def test_chemistry_charges_arrows_and_nuclides() -> None:
    assert speak(r"\ce{SO4^2-}") == "S O 4 2 minus"
    assert speak(r"\ce{Fe^3+ + e- -> Fe^2+}") == "F E 3 plus plus an electron gives F E 2 plus"
    assert speak(r"\ce{N2 + 3H2 <=> 2NH3}") == "N 2 plus 3 H 2 is in equilibrium with 2 N H 3"
    assert speak(r"\ce{CaCO3 ->[heat] CaO + CO2}") == "C A C O 3 gives, with heat, C A O plus C O 2"
    assert speak(r"\ce{^{235}_{92}U}") == "U, mass number 235, atomic number 92"


def test_chemistry_inside_a_sentence() -> None:
    assert speak_text(r"Sulphuric acid is $\ce{H2SO4}$.") == "Sulphuric acid is H 2 S O 4."


# ---------------------------------------------------------------------------------- physics


def test_physics_units_are_said_with_per_for_a_negative_power() -> None:
    assert speak(r"20\ \text{m s}^{-1}") == "20 metres per second"
    assert speak(r"9.8\,\text{m s}^{-2}") == "9.8 metres per second squared"
    assert speak(r"1000\ \text{kg m}^{-3}") == "1000 kilograms per metre cubed"
    assert speak(r"4200\ \text{J kg}^{-1}\ \text{K}^{-1}") == "4200 joules per kilogram per kelvin"
    assert speak(r"\text{N m}^{-2}") == "newtons per metre squared"
    assert speak(r"100\ \text{km h}^{-1}") == "100 kilometres per hour"
    assert speak(r"6.6 \times 10^{-34}\ \text{J s}") == (
        "6.6 times 10 to the power minus 34 joule seconds"
    )
    # JAMB's jammed "ms⁻¹" is metres per second, not milliseconds
    assert speak(r"\text{ms}^{-1}") == "metres per second"


def test_powers_of_ten_ohms_microfarads_and_degrees() -> None:
    assert speak(r"3.0 \times 10^{8}\ \text{m s}^{-1}") == (
        "3.0 times 10 to the power 8 metres per second"
    )
    assert speak(r"4\ \Omega") == "4 ohms"
    assert speak(r"2\ \text{k}\Omega") == "2 kilohms"
    assert speak(r"2\,\mu\text{F}") == "2 microfarads"
    assert speak(r"14 \times 10^{-6}\ \text{F}") == "14 times 10 to the power minus 6 farads"
    assert speak(r"30^{\circ}") == "30 degrees"
    assert speak(r"20\ ^{\circ}\text{C}") == "20 degrees Celsius"
    assert speak(r"2 \times 10^{-5}\ {}^{\circ}\text{C}^{-1}") == (
        "2 times 10 to the power minus 5 per degree Celsius"
    )
    assert speak(r"273\ \text{K}") == "273 kelvin"


def test_physics_formulae_and_greek_letters() -> None:
    assert speak(r"\dfrac{1}{f} = \dfrac{1}{u} + \dfrac{1}{v}") == (
        "1 over f equals 1 over u plus 1 over v"
    )
    assert speak(r"v = f\lambda") == "v equals f lambda"
    assert speak(r"\sin\theta") == "sine theta"
    assert speak(r"\eta = 75\%") == "eta equals 75 percent"
    assert speak(r"F = \mu R") == "F equals mu R"  # mu the coefficient, not a prefix
    assert speak(r"^{238}_{92}\text{U}") == "U, mass number 238, atomic number 92"
    assert speak(r"{}^{0}_{-1}\text{e}") == "e, mass number 0, atomic number minus 1"


def test_a_lone_capital_is_a_unit_only_where_a_unit_goes() -> None:
    assert speak(r"5\ \text{N}") == "5 newtons"
    assert speak(r"\text{F} = ma") == "F equals m a"
    # Mathematics' currency puzzle writes naira and its rival currency as capitals
    assert speak(r"0.225\,\text{N} = 0.171\,\text{M}") == "0.225 N equals 0.171 M"
    assert speak(r"60^{\circ}\text{N}") == "60 degrees N"  # north
    # dimensions are letters, not teslas
    assert (
        speak(r"\text{ML}^{-1}\text{T}^{-2}") == "ML to the power minus one T to the power minus 2"
    )


def test_plain_text_units_are_said_only_where_nothing_else_is_meant() -> None:
    assert speak_text("It moves at 20 m s⁻¹ through 4 Ω and 2 μF.") == (
        "It moves at 20 metres per second through 4 ohms and 2 microfarads."
    )
    assert speak_text("c = 4200 J kg⁻¹ K⁻¹ and R = 2 kΩ") == (
        "c = 4200 joules per kilogram per kelvin and R = 2 kilohms"
    )
    # what the voice already reads well is left as it is, so voiced lines keep their audio
    assert speak_text("Add 25 cm³ of acid at 30 °C.") == "Add 25 cm³ of acid at 30 °C."
    # a faraday and a charge in Chemistry stay as they are written
    assert speak_text("96 500 C is one faraday, so 3 F per mole.") == (
        "96 500 C is one faraday, so 3 F per mole."
    )
