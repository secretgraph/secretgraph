import * as React from 'react'

export interface UploadButtonProps {
    name?: string
    accept?: string
    onChange?: (ev: React.ChangeEvent<HTMLInputElement>) => void
    onClick?: (ev: React.MouseEvent<HTMLInputElement>) => void
    children: JSX.Element | JSX.Element[]
    className?: string
}

export default function UploadButton({
    name,
    accept,
    onChange,
    onClick,
    className,
    children,
}: UploadButtonProps) {
    return (
        <label className={className}>
            <input
                style={{ display: 'none' }}
                name={name}
                accept={accept}
                type="file"
                onChange={onChange}
                onClick={onClick}
            />
            {children}
        </label>
    )
}
