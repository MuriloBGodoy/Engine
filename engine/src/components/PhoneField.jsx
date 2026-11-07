import { countries } from "../services/locations";
import { maskPhone, splitPhone } from "../services/phone";

/**
 * Campo de telefone com seletor de código de país (+55, +351, …) + máscara.
 * Controlado por UMA string só (`value`), no formato "+55 (11) 91234-5678",
 * para caber direto em profile.phone sem estado extra. O dial é extraído da
 * string (maior prefixo casado); o resto é o número nacional, remascarado.
 */

const DIAL_OPTIONS = [...countries].sort((a, b) => a.name.localeCompare(b.name));

export function PhoneField({
  value,
  onChange,
  defaultDial = "+55",
  inputClassName = "",
  selectClassName = "",
  inputId,
  placeholder,
}) {
  const { dial, number } = splitPhone(value, defaultDial);

  const emit = (nextDial, nextRaw) => {
    const masked = maskPhone(nextDial, nextRaw);
    onChange(`${nextDial} ${masked}`.trim());
  };

  return (
    <div className="phone-row">
      <select
        aria-label="País"
        className={selectClassName}
        value={dial}
        onChange={(event) => emit(event.target.value, number)}
      >
        {DIAL_OPTIONS.map((country) => (
          <option key={country.code} value={country.dial}>
            {country.code} {country.dial}
          </option>
        ))}
      </select>
      <input
        id={inputId}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        className={inputClassName}
        placeholder={placeholder}
        value={maskPhone(dial, number)}
        onChange={(event) => emit(dial, event.target.value)}
      />
    </div>
  );
}
