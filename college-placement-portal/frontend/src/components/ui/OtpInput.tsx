import { useRef, useState, useEffect } from 'react';
import { clsx } from 'clsx';

interface OtpInputProps {
    length?: number;
    value: string;
    onChange: (value: string) => void;
    error?: boolean;
}

export default function OtpInput({ length = 6, value, onChange, error }: OtpInputProps) {
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const [digits, setDigits] = useState<string[]>(Array(length).fill(''));

    useEffect(() => {
        const arr = value.split('').slice(0, length);
        const padded = [...arr, ...Array(length - arr.length).fill('')];
        setDigits(padded);
    }, [value, length]);

    const focusInput = (index: number) => {
        if (index >= 0 && index < length) {
            inputRefs.current[index]?.focus();
        }
    };

    const handleChange = (index: number, val: string) => {
        if (!/^\d*$/.test(val)) return;

        const newDigits = [...digits];
        newDigits[index] = val.slice(-1);
        setDigits(newDigits);
        onChange(newDigits.join(''));

        if (val && index < length - 1) {
            focusInput(index + 1);
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !digits[index] && index > 0) {
            focusInput(index - 1);
        }
        if (e.key === 'ArrowLeft') focusInput(index - 1);
        if (e.key === 'ArrowRight') focusInput(index + 1);
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
        const newDigits = pasted.split('');
        const padded = [...newDigits, ...Array(length - newDigits.length).fill('')];
        setDigits(padded);
        onChange(padded.join(''));
        focusInput(Math.min(pasted.length, length - 1));
    };

    return (
        <div className="flex gap-2 sm:gap-3 justify-center">
            {digits.map((digit, i) => (
                <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={handlePaste}
                    className={clsx(
                        'w-10 h-12 sm:w-12 sm:h-14 text-center text-lg font-semibold rounded-lg border bg-white',
                        'transition-all duration-200',
                        'focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none',
                        error
                            ? 'border-red-400'
                            : digit
                                ? 'border-primary-400'
                                : 'border-gray-300 hover:border-gray-400'
                    )}
                />
            ))}
        </div>
    );
}
