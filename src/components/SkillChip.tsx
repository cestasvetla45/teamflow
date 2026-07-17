import { cn, skillCategoryStyle } from '@/lib/utils'

interface SkillChipProps {
  name: string
  category?: string | null
  proficiency?: number | null
  className?: string
}

export function SkillChip({ name, category = 'general', proficiency, className }: SkillChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        skillCategoryStyle(category),
        className
      )}
    >
      {name}
      {typeof proficiency === 'number' && (
        <span className="flex items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                i < proficiency ? 'bg-current opacity-90' : 'bg-current opacity-25'
              )}
            />
          ))}
        </span>
      )}
    </span>
  )
}
