import * as React from 'react'

export interface UploadButtonProps {
    name?: string
    accept?: string
    multiple?: boolean
    onChange?: (ev: React.ChangeEvent<HTMLInputElement>) => void
    onClick?: (ev: React.MouseEvent<HTMLInputElement>) => void
    children: JSX.Element | JSX.Element[]
}

export default function UploadButton({
    name,
    accept,
    onChange,
    onClick,
    children,
    multiple,
}: UploadButtonProps) {
    return (
        <label>
            <input
                style={{ display: 'none' }}
                name={name}
                accept={accept}
                type="file"
                onChange={onChange}
                onClick={onClick}
                multiple={multiple}
            />
            {children}
        </label>
    )
}
