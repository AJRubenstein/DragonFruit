#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TriangleBudget {
    pub budget_tris: usize,
    pub target_error: f64,
    pub is_decimated: bool,
    pub bbox_diagonal_mm: f64,
}

pub fn compute_triangle_budget(
    triangle_count: usize,
    bbox_diagonal_mm: f64,
    available_ram_bytes: Option<u64>,
) -> TriangleBudget {
    let _ = available_ram_bytes; // Unused for now, but kept for future use

    let max_budget_triangles = 4_000_000;
    
    // Bounding-Box Scaled Epsilon: epsilon = (bbox_diagonal_mm * 0.0005).clamp(0.01, 0.10)
    let epsilon = (bbox_diagonal_mm * 0.0005).clamp(0.01, 0.10);

    // Micro-Model Soft Headroom
    let effective_budget = if bbox_diagonal_mm < 50.0 || epsilon <= 0.01 {
        4_500_000
    } else {
        max_budget_triangles
    };

    if triangle_count <= effective_budget {
        TriangleBudget {
            budget_tris: effective_budget,
            target_error: epsilon,
            is_decimated: false,
            bbox_diagonal_mm,
        }
    } else {
        TriangleBudget {
            budget_tris: effective_budget,
            target_error: epsilon,
            is_decimated: true,
            bbox_diagonal_mm,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_triangle_budget_1_5m() {
        // 1.5M triangles, large object -> no decimation
        let budget = compute_triangle_budget(1_500_000, 150.0, None);
        assert_eq!(budget.is_decimated, false);
        assert_eq!(budget.budget_tris, 4_000_000);
        assert!((budget.target_error - 0.075).abs() < f64::EPSILON);
        assert_eq!(budget.bbox_diagonal_mm, 150.0);
    }

    #[test]
    fn test_compute_triangle_budget_4_2m_micro_model() {
        // 4.2M triangles, micro model -> soft headroom kicks in, no decimation
        let budget = compute_triangle_budget(4_200_000, 40.0, None);
        assert_eq!(budget.is_decimated, false);
        assert_eq!(budget.budget_tris, 4_500_000);
        assert!((budget.target_error - 0.02).abs() < f64::EPSILON);
    }

    #[test]
    fn test_compute_triangle_budget_6m() {
        // 6M triangles, large object -> decimated to 4M
        let budget = compute_triangle_budget(6_000_000, 250.0, None);
        assert_eq!(budget.is_decimated, true);
        assert_eq!(budget.budget_tris, 4_000_000);
        assert!((budget.target_error - 0.10).abs() < f64::EPSILON); // Clamped to 0.10
    }

    #[test]
    fn test_compute_triangle_budget_12m() {
        // 12M triangles, standard object -> decimated
        let budget = compute_triangle_budget(12_000_000, 100.0, None);
        assert_eq!(budget.is_decimated, true);
        assert_eq!(budget.budget_tris, 4_000_000);
        assert!((budget.target_error - 0.05).abs() < f64::EPSILON);
    }
}
